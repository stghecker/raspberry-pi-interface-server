import os
import sqlite3
import hashlib
import secrets
import shutil
import json
import time
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path, PurePath

import psutil
from flask import (
    Flask, render_template, request, redirect, url_for,
    session, jsonify, send_file, abort, flash, g, make_response
)

_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
_TEMPLATES_DIR = os.path.join(_BASE_DIR, 'templates')
_STATIC_DIR = os.path.join(_BASE_DIR, 'static')

# Fail fast with a helpful message if the templates/static folders are missing.
# This is the most common deployment issue: only app.py was copied, not the whole project.
_missing = []
if not os.path.isdir(_TEMPLATES_DIR) or not os.path.isfile(os.path.join(_TEMPLATES_DIR, 'login.html')):
    _missing.append(f"  templates/ folder (expected at {_TEMPLATES_DIR})")
if not os.path.isdir(_STATIC_DIR):
    _missing.append(f"  static/ folder (expected at {_STATIC_DIR})")
if _missing:
    print("\n" + "=" * 60)
    print("  ERROR: Missing project folders!")
    print("  The following could not be found next to app.py:")
    for m in _missing:
        print(m)
    print()
    print("  Make sure you copied the ENTIRE project, not just app.py.")
    print("  The folder structure should be:")
    print("    webserver/")
    print("      app.py")
    print("      templates/   <- login.html, dashboard.html, etc.")
    print("      static/      <- css/ and js/ folders")
    print("      requirements.txt")
    print("      start.sh")
    print("=" * 60 + "\n")
    raise SystemExit("Cannot start: missing templates/ or static/ folders. See message above.")

app = Flask(__name__, template_folder=_TEMPLATES_DIR, static_folder=_STATIC_DIR)
app.secret_key = secrets.token_hex(32)
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE='Lax',
    PERMANENT_SESSION_LIFETIME=86400,
)

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / 'pi_dashboard.db'
# Root the file explorer at the user's home directory so it's useful out of the box.
FILE_ROOT = Path(os.path.expanduser('~')).resolve()


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

def get_db():
    db = getattr(g, '_database', None)
    if db is None:
        db = g._database = sqlite3.connect(DB_PATH)
        db.row_factory = sqlite3.Row
    return db


@app.teardown_appcontext
def close_db(exc):
    db = getattr(g, '_database', None)
    if db is not None:
        db.close()


def hash_password(password, salt=None):
    if salt is None:
        salt = secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), 200000)
    return salt, h.hex()


def verify_password(password, salt, stored_hash):
    _, computed = hash_password(password, salt)
    return secrets.compare_digest(computed, stored_hash)


def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL DEFAULT '',
        password_salt TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        is_admin INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_folders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        folder_path TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE (user_id, folder_path)
    );
    """)
    # Seed default admin
    cur = conn.execute("SELECT id FROM users WHERE username = ?", ('admin',))
    if cur.fetchone() is None:
        salt, h = hash_password('admin123')
        conn.execute(
            "INSERT INTO users (username, display_name, password_salt, password_hash, is_admin) VALUES (?, ?, ?, ?, 1)",
            ('admin', 'Administrator', salt, h)
        )
    # Add theme column if not present (migration)
    cols = conn.execute("PRAGMA table_info(users)").fetchall()
    if 'theme' not in [c[1] for c in cols]:
        conn.execute("ALTER TABLE users ADD COLUMN theme TEXT")
    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------

def current_user():
    uid = session.get('uid')
    if not uid:
        return None
    db = get_db()
    row = db.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
    if row is None:
        session.clear()
        return None
    return row


def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if current_user() is None:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return wrapper


def admin_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            return redirect(url_for('login'))
        if not user['is_admin']:
            abort(403)
        return f(*args, **kwargs)
    return wrapper


def allowed_folders(user):
    """Return list of absolute folder paths the user may access."""
    db = get_db()
    if user['is_admin']:
        return [str(FILE_ROOT)]
    rows = db.execute(
        "SELECT folder_path FROM user_folders WHERE user_id = ? ORDER BY folder_path",
        (user['id'],)
    ).fetchall()
    return [r['folder_path'] for r in rows]


def resolve_safe_folder(rel_path, user):
    """Resolve a relative path against FILE_ROOT and verify it is inside an allowed folder.
    Returns the absolute Path or None if not allowed."""
    rel = (rel_path or '').strip('/')
    user = user or current_user()
    if user['is_admin']:
        target = (FILE_ROOT / rel).resolve() if rel else FILE_ROOT
        try:
            target.relative_to(FILE_ROOT)
        except ValueError:
            return None
        return target
    # Non-admin: at root they see their assigned folders listed by basename.
    # Navigate into a folder by matching the first path segment to an allowed folder's name.
    if not rel:
        return FILE_ROOT
    parts = rel.split('/', 1)
    first = parts[0]
    remainder = parts[1] if len(parts) > 1 else ''
    for folder in allowed_folders(user):
        f = Path(folder).resolve()
        if f.name == first:
            target = (f / remainder).resolve() if remainder else f
            try:
                target.relative_to(f)
            except ValueError:
                return None
            return target
    return None


# ---------------------------------------------------------------------------
# System metrics
# ---------------------------------------------------------------------------

def cpu_temperature():
    try:
        with open('/sys/class/thermal/thermal_zone0/temp') as f:
            return round(int(f.read().strip()) / 1000.0, 1)
    except Exception:
        temps = psutil.sensors_temperatures()
        for name, entries in temps.items():
            if entries:
                return round(entries[0].current, 1)
        return None


def _safe(fn, default=None):
    try:
        return fn()
    except Exception:
        return default


def system_snapshot():
    vm = _safe(psutil.virtual_memory)
    sm = _safe(psutil.swap_memory)
    du = _safe(lambda: psutil.disk_usage('/'))
    boot = _safe(lambda: datetime.fromtimestamp(psutil.boot_time(), tz=timezone.utc))
    uptime = (datetime.now(timezone.utc) - boot) if boot else None
    net = _safe(psutil.net_io_counters)
    return {
        'cpu_percent': _safe(lambda: psutil.cpu_percent(interval=None), 0.0),
        'cpu_count': _safe(lambda: psutil.cpu_count(logical=True), 0),
        'cpu_count_physical': _safe(lambda: psutil.cpu_count(logical=False), 0),
        'cpu_temp': cpu_temperature(),
        'mem_total': vm.total if vm else 0,
        'mem_used': vm.used if vm else 0,
        'mem_percent': vm.percent if vm else 0,
        'swap_total': sm.total if sm else 0,
        'swap_used': sm.used if sm else 0,
        'swap_percent': sm.percent if sm else 0,
        'disk_total': du.total if du else 0,
        'disk_used': du.used if du else 0,
        'disk_percent': du.percent if du else 0,
        'net_sent': net.bytes_sent if net else 0,
        'net_recv': net.bytes_recv if net else 0,
        'uptime_seconds': int(uptime.total_seconds()) if uptime else 0,
        'load_avg': list(os.getloadavg()) if hasattr(os, 'getloadavg') else None,
        'processes': _safe(lambda: len(psutil.pids()), 0),
        'hostname': _safe(lambda: os.uname().nodename, 'localhost'),
    }


# ---------------------------------------------------------------------------
# Routes — auth
# ---------------------------------------------------------------------------

@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user():
        return redirect(url_for('dashboard'))
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '')
        db = get_db()
        row = db.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        if row and verify_password(password, row['password_salt'], row['password_hash']):
            session.clear()
            session['uid'] = row['id']
            session.permanent = True
            return redirect(url_for('dashboard'))
        return render_template('login.html', error='Invalid username or password'), 401
    return render_template('login.html')


@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))


# ---------------------------------------------------------------------------
# Routes — pages
# ---------------------------------------------------------------------------

@app.context_processor
def inject_theme():
    user = current_user()
    theme_raw = user['theme'] if user else None
    return dict(theme_raw=theme_raw)


@app.route('/')
@login_required
def dashboard():
    return render_template('dashboard.html', user=current_user(), active='dashboard')


@app.route('/files')
@login_required
def files():
    return render_template('files.html', user=current_user(), active='files')


@app.route('/users')
@admin_required
def users_page():
    return render_template('users.html', user=current_user(), active='users')


@app.route('/profile')
@login_required
def profile_page():
    return render_template('profile.html', user=current_user(), active='profile')


@app.route('/settings')
@login_required
def settings_page():
    return render_template('settings.html', user=current_user(), active='settings')


# ---------------------------------------------------------------------------
# API — system metrics
# ---------------------------------------------------------------------------

@app.route('/api/metrics')
@login_required
def api_metrics():
    snap = system_snapshot()
    # prime cpu_percent for next call
    psutil.cpu_percent(interval=None)
    return jsonify(snap)


@app.route('/api/processes')
@login_required
def api_processes():
    procs = []
    for p in psutil.process_iter(['pid', 'name', 'username', 'cpu_percent',
                                   'memory_percent', 'memory_info', 'status',
                                   'create_time']):
        try:
            info = p.info
            procs.append({
                'pid': info['pid'],
                'name': info['name'] or '—',
                'user': info['username'] or '—',
                'cpu': round(info['cpu_percent'] or 0, 1),
                'mem': round(info['memory_percent'] or 0, 1),
                'mem_bytes': info['memory_info'].rss if info['memory_info'] else 0,
                'status': info['status'] or 'unknown',
                'started': info['create_time'] or 0,
            })
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    procs.sort(key=lambda x: x['cpu'], reverse=True)
    return jsonify(procs)


@app.route('/api/processes/<int:pid>/kill', methods=['POST'])
@admin_required
def api_process_kill(pid):
    if pid == os.getpid():
        return jsonify({'error': 'Cannot kill the dashboard process'}), 400
    try:
        p = psutil.Process(pid)
        name = p.name()
        p.terminate()
        try:
            p.wait(timeout=3)
        except psutil.TimeoutExpired:
            p.kill()
        return jsonify({'ok': True, 'name': name})
    except psutil.NoSuchProcess:
        return jsonify({'error': 'Process not found'}), 404
    except psutil.AccessDenied:
        return jsonify({'error': 'Permission denied'}), 403
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ---------------------------------------------------------------------------
# API — file explorer
# ---------------------------------------------------------------------------

@app.route('/api/files/list')
@login_required
def api_files_list():
    rel = request.args.get('path', '')
    target = resolve_safe_folder(rel, current_user())
    if target is None or not target.exists():
        return jsonify({'error': 'Access denied or folder not found'}), 403
    if not target.is_dir():
        return jsonify({'error': 'Not a folder'}), 400
    items = []
    user = current_user()
    if not user['is_admin'] and target == FILE_ROOT:
        # Non-admin at root: show only their assigned folders as virtual entries.
        for folder in allowed_folders(user):
            f = Path(folder)
            name = f.name or str(f)
            try:
                st = f.stat()
                items.append({
                    'name': name,
                    'is_dir': True,
                    'size': 0,
                    'modified': st.st_mtime,
                })
            except OSError:
                continue
    else:
        try:
            for child in sorted(target.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower())):
                if child.name.startswith('.'):
                    continue
                try:
                    st = child.stat()
                except OSError:
                    continue
                items.append({
                    'name': child.name,
                    'is_dir': child.is_dir(),
                    'size': st.st_size if not child.is_dir() else 0,
                    'modified': st.st_mtime,
                })
        except PermissionError:
            return jsonify({'error': 'Permission denied'}), 403

    try:
        rel_display = str(target.relative_to(FILE_ROOT)) if str(target) != str(FILE_ROOT) else ''
    except ValueError:
        rel_display = rel
    return jsonify({
        'path': rel_display,
        'absolute': str(target),
        'items': items,
    })


@app.route('/api/files/download')
@login_required
def api_files_download():
    rel = request.args.get('path', '')
    target = resolve_safe_folder(rel, current_user())
    if target is None or not target.exists() or not target.is_file():
        abort(403)
    return send_file(str(target), as_attachment=True)


@app.route('/api/files/upload', methods=['POST'])
@admin_required
def api_files_upload():
    rel = request.form.get('path', '')
    target_dir = resolve_safe_folder(rel, current_user())
    if target_dir is None or not target_dir.is_dir():
        return jsonify({'error': 'Invalid destination folder'}), 403
    file = request.files.get('file')
    if not file or file.filename == '':
        return jsonify({'error': 'No file provided'}), 400
    from werkzeug.utils import secure_filename
    name = secure_filename(file.filename)
    if not name:
        return jsonify({'error': 'Invalid filename'}), 400
    dest = target_dir / name
    file.save(str(dest))
    return jsonify({'ok': True, 'name': name, 'size': dest.stat().st_size})


@app.route('/api/files/delete', methods=['POST'])
@admin_required
def api_files_delete():
    body = request.get_json(silent=True) or {}
    rel = body.get('path', '')
    target = resolve_safe_folder(rel, current_user())
    if target is None or not target.exists():
        return jsonify({'error': 'Invalid path'}), 403
    if target.resolve() == FILE_ROOT.resolve():
        return jsonify({'error': 'Cannot delete root'}), 400
    try:
        if target.is_dir():
            shutil.rmtree(str(target))
        else:
            target.unlink()
    except OSError as e:
        return jsonify({'error': str(e)}), 500
    return jsonify({'ok': True})


@app.route('/api/files/mkdir', methods=['POST'])
@admin_required
def api_files_mkdir():
    body = request.get_json(silent=True) or {}
    rel = body.get('path', '')
    name = (body.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'Folder name required'}), 400
    from werkzeug.utils import secure_filename
    name = secure_filename(name)
    if not name:
        return jsonify({'error': 'Invalid folder name'}), 400
    parent = resolve_safe_folder(rel, current_user())
    if parent is None or not parent.is_dir():
        return jsonify({'error': 'Invalid parent folder'}), 403
    dest = parent / name
    try:
        dest.mkdir(exist_ok=False)
    except FileExistsError:
        return jsonify({'error': 'Already exists'}), 409
    except OSError as e:
        return jsonify({'error': str(e)}), 500
    return jsonify({'ok': True})


# ---------------------------------------------------------------------------
# API — admin user management
# ---------------------------------------------------------------------------

@app.route('/api/users')
@admin_required
def api_users_list():
    db = get_db()
    rows = db.execute(
        "SELECT id, username, display_name, is_admin, created_at, theme FROM users ORDER BY id"
    ).fetchall()
    out = []
    for r in rows:
        folders = db.execute(
            "SELECT folder_path FROM user_folders WHERE user_id = ? ORDER BY folder_path",
            (r['id'],)
        ).fetchall()
        out.append({
            'id': r['id'],
            'username': r['username'],
            'display_name': r['display_name'],
            'is_admin': bool(r['is_admin']),
            'created_at': r['created_at'],
            'folders': [f['folder_path'] for f in folders],
            'has_custom_theme': bool(r['theme']),
        })
    return jsonify(out)


@app.route('/api/users/create', methods=['POST'])
@admin_required
def api_users_create():
    body = request.get_json(silent=True) or {}
    username = (body.get('username') or '').strip()
    display_name = (body.get('display_name') or '').strip()
    password = body.get('password') or ''
    is_admin = bool(body.get('is_admin', False))
    folders = body.get('folders') or []

    if not username or not password:
        return jsonify({'error': 'Username and password are required'}), 400
    if len(password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters'}), 400

    db = get_db()
    if db.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone():
        return jsonify({'error': 'Username already exists'}), 409

    salt, h = hash_password(password)
    cur = db.execute(
        "INSERT INTO users (username, display_name, password_salt, password_hash, is_admin) VALUES (?, ?, ?, ?, ?)",
        (username, display_name or username, salt, h, 1 if is_admin else 0)
    )
    uid = cur.lastrowid
    for f in folders:
        norm = str(Path(f).expanduser().resolve())
        db.execute(
            "INSERT OR IGNORE INTO user_folders (user_id, folder_path) VALUES (?, ?)",
            (uid, norm)
        )
    db.commit()
    return jsonify({'ok': True, 'id': uid})


@app.route('/api/users/<int:uid>', methods=['DELETE'])
@admin_required
def api_users_delete(uid):
    me = current_user()
    if uid == me['id']:
        return jsonify({'error': 'You cannot delete your own account'}), 400
    db = get_db()
    row = db.execute("SELECT is_admin FROM users WHERE id = ?", (uid,)).fetchone()
    if not row:
        return jsonify({'error': 'User not found'}), 404
    db.execute("DELETE FROM user_folders WHERE user_id = ?", (uid,))
    db.execute("DELETE FROM users WHERE id = ?", (uid,))
    db.commit()
    return jsonify({'ok': True})


@app.route('/api/users/<int:uid>/password', methods=['POST'])
@admin_required
def api_users_password(uid):
    body = request.get_json(silent=True) or {}
    new_password = body.get('password') or ''
    if len(new_password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters'}), 400
    db = get_db()
    if not db.execute("SELECT id FROM users WHERE id = ?", (uid,)).fetchone():
        return jsonify({'error': 'User not found'}), 404
    salt, h = hash_password(new_password)
    db.execute(
        "UPDATE users SET password_salt = ?, password_hash = ? WHERE id = ?",
        (salt, h, uid)
    )
    db.commit()
    return jsonify({'ok': True})


@app.route('/api/users/<int:uid>/profile', methods=['POST'])
@admin_required
def api_users_profile(uid):
    body = request.get_json(silent=True) or {}
    display_name = (body.get('display_name') or '').strip()
    db = get_db()
    if not db.execute("SELECT id FROM users WHERE id = ?", (uid,)).fetchone():
        return jsonify({'error': 'User not found'}), 404
    db.execute("UPDATE users SET display_name = ? WHERE id = ?", (display_name, uid))
    db.commit()
    return jsonify({'ok': True})


@app.route('/api/users/<int:uid>/folders', methods=['POST'])
@admin_required
def api_users_folders(uid):
    body = request.get_json(silent=True) or {}
    folders = body.get('folders') or []
    db = get_db()
    if not db.execute("SELECT id FROM users WHERE id = ?", (uid,)).fetchone():
        return jsonify({'error': 'User not found'}), 404
    db.execute("DELETE FROM user_folders WHERE user_id = ?", (uid,))
    for f in folders:
        norm = str(Path(f).expanduser().resolve())
        db.execute(
            "INSERT OR IGNORE INTO user_folders (user_id, folder_path) VALUES (?, ?)",
            (uid, norm)
        )
    db.commit()
    return jsonify({'ok': True})


@app.route('/api/users/<int:uid>/admin', methods=['POST'])
@admin_required
def api_users_toggle_admin(uid):
    body = request.get_json(silent=True) or {}
    is_admin = bool(body.get('is_admin', False))
    me = current_user()
    if uid == me['id'] and not is_admin:
        return jsonify({'error': 'You cannot remove your own admin rights'}), 400
    db = get_db()
    if not db.execute("SELECT id FROM users WHERE id = ?", (uid,)).fetchone():
        return jsonify({'error': 'User not found'}), 404
    db.execute("UPDATE users SET is_admin = ? WHERE id = ?", (1 if is_admin else 0, uid))
    db.commit()
    return jsonify({'ok': True})


# ---------------------------------------------------------------------------
# API — self profile
# ---------------------------------------------------------------------------

@app.route('/api/profile/password', methods=['POST'])
@login_required
def api_profile_password():
    body = request.get_json(silent=True) or {}
    current_pwd = body.get('current_password') or ''
    new_pwd = body.get('new_password') or ''
    if len(new_pwd) < 6:
        return jsonify({'error': 'New password must be at least 6 characters'}), 400
    user = current_user()
    if not verify_password(current_pwd, user['password_salt'], user['password_hash']):
        return jsonify({'error': 'Current password is incorrect'}), 403
    salt, h = hash_password(new_pwd)
    db = get_db()
    db.execute(
        "UPDATE users SET password_salt = ?, password_hash = ? WHERE id = ?",
        (salt, h, user['id'])
    )
    db.commit()
    return jsonify({'ok': True})


@app.route('/api/profile/name', methods=['POST'])
@login_required
def api_profile_name():
    body = request.get_json(silent=True) or {}
    name = (body.get('display_name') or '').strip()
    user = current_user()
    db = get_db()
    db.execute("UPDATE users SET display_name = ? WHERE id = ?", (name, user['id']))
    db.commit()
    return jsonify({'ok': True})


@app.route('/api/me')
@login_required
def api_me():
    user = current_user()
    return jsonify({
        'id': user['id'],
        'username': user['username'],
        'display_name': user['display_name'],
        'is_admin': bool(user['is_admin']),
    })


@app.route('/api/theme', methods=['GET'])
@login_required
def api_theme_get():
    user = current_user()
    try:
        theme = json.loads(user['theme']) if user['theme'] else None
    except (ValueError, TypeError):
        theme = None
    return jsonify(theme or {'preset': 'midnight'})


@app.route('/api/theme', methods=['POST'])
@login_required
def api_theme_set():
    body = request.get_json(silent=True) or {}
    user = current_user()
    db = get_db()
    db.execute("UPDATE users SET theme = ? WHERE id = ?", (json.dumps(body), user['id']))
    db.commit()
    return jsonify({'ok': True})


@app.route('/api/users/<int:uid>/reset-theme', methods=['POST'])
@admin_required
def api_users_reset_theme(uid):
    db = get_db()
    if not db.execute("SELECT id FROM users WHERE id = ?", (uid,)).fetchone():
        return jsonify({'error': 'User not found'}), 404
    db.execute("UPDATE users SET theme = NULL WHERE id = ?", (uid,))
    db.commit()
    return jsonify({'ok': True})


# ---------------------------------------------------------------------------
# Error handlers
# ---------------------------------------------------------------------------

@app.errorhandler(403)
def forbidden(e):
    if request.path.startswith('/api/'):
        return jsonify({'error': 'Forbidden'}), 403
    return render_template('error.html', code=403, message="You don't have permission to view this page.", user=current_user()), 403


@app.errorhandler(404)
def not_found(e):
    if request.path.startswith('/api/'):
        return jsonify({'error': 'Not found'}), 404
    return render_template('error.html', code=404, message="That page doesn't exist.", user=current_user()), 404


if __name__ == '__main__':
    init_db()
    # Bind to 0.0.0.0 so it's reachable from other devices on the LAN via the Pi's IP.
    # Debug mode shows full error tracebacks in the browser and auto-reloads on file changes.
    app.run(host='0.0.0.0', port=5000, debug=True)
