import os
import sqlite3
from functools import wraps
from flask import (
    Flask, render_template, request, redirect,
    url_for, send_file, session, g, abort
)

app = Flask(__name__)
app.secret_key = "CHANGE_THIS_SECRET_KEY"

DB_PATH = "users.db"


# -------------------------
# SQLite helpers
# -------------------------
def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    db = get_db()

    db.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT,
            is_admin INTEGER DEFAULT 0,
            base_dir TEXT NOT NULL,
            can_terminal INTEGER DEFAULT 0,
            can_restart INTEGER DEFAULT 0,
            can_info INTEGER DEFAULT 0
        )
        """
    )
    db.commit()

    # Default admin
    cur = db.execute("SELECT id FROM users WHERE username = ?", ("admin",))
    if cur.fetchone() is None:
        db.execute(
            """
            INSERT INTO users (username, password, is_admin, base_dir, can_terminal, can_restart, can_info)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            ("admin", "admin123", 1, "/", 1, 1, 1),
        )
        db.commit()

    # Default guest
    cur = db.execute("SELECT id FROM users WHERE username = ?", ("guest",))
    if cur.fetchone() is None:
        db.execute(
            """
            INSERT INTO users (username, password, is_admin, base_dir, can_terminal, can_restart, can_info)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            ("guest", None, 0, "/", 0, 0, 0),
        )
        db.commit()


@app.before_request
def load_logged_in_user():
    user_id = session.get("user_id")
    if user_id is None:
        g.user = None
    else:
        db = get_db()
        g.user = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()


# -------------------------
# decorators
# -------------------------
def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if g.user is None:
            return redirect(url_for("login"))
        return f(*args, **kwargs)
    return wrapper


def admin_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if g.user is None or g.user["is_admin"] != 1:
            abort(403)
        return f(*args, **kwargs)
    return wrapper


# -------------------------
# auth
# -------------------------
@app.route("/login", methods=["GET", "POST"])
def login():
    db = get_db()
    error = None

    if request.method == "POST":
        if "guest" in request.form:
            user = db.execute("SELECT * FROM users WHERE username = ?", ("guest",)).fetchone()
            session.clear()
            session["user_id"] = user["id"]
            return redirect(url_for("home"))

        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")

        user = db.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()

        if user is None or user["password"] != password:
            error = "Invalid username or password."
        else:
            session.clear()
            session["user_id"] = user["id"]
            return redirect(url_for("home"))

    return render_template("login.html", error=error)


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


# -------------------------
# admin panel
# -------------------------
@app.route("/admin")
@admin_required
def admin_panel():
    db = get_db()
    users = db.execute(
        "SELECT id, username, is_admin, base_dir, can_terminal, can_restart, can_info FROM users"
    ).fetchall()
    return render_template("admin.html", users=users)


@app.route("/admin/create", methods=["GET", "POST"])
@admin_required
def admin_create_user():
    db = get_db()
    error = None

    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "").strip()
        base_dir = request.form.get("base_dir", "/").strip() or "/"

        is_admin = 1 if request.form.get("is_admin") == "on" else 0
        can_terminal = 1 if request.form.get("can_terminal") == "on" else 0
        can_restart = 1 if request.form.get("can_restart") == "on" else 0
        can_info = 1 if request.form.get("can_info") == "on" else 0

        try:
            db.execute(
                """
                INSERT INTO users (username, password, is_admin, base_dir, can_terminal, can_restart, can_info)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (username, password or None, is_admin, base_dir, can_terminal, can_restart, can_info),
            )
            db.commit()
            return redirect(url_for("admin_panel"))
        except sqlite3.IntegrityError:
            error = "Username already exists."

    return render_template("admin_create.html", error=error)


# -------------------------
# ADMIN EDIT USER
# -------------------------
@app.route("/admin/edit/<int:user_id>", methods=["GET", "POST"])
@admin_required
def admin_edit_user(user_id):
    db = get_db()
    user = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()

    if user is None:
        abort(404)

    if request.method == "POST":
        username = request.form.get("username").strip()
        password = request.form.get("password").strip() or user["password"]
        base_dir = request.form.get("base_dir").strip()

        is_admin = 1 if request.form.get("is_admin") == "on" else 0
        can_terminal = 1 if request.form.get("can_terminal") == "on" else 0
        can_restart = 1 if request.form.get("can_restart") == "on" else 0
        can_info = 1 if request.form.get("can_info") == "on" else 0

        db.execute(
            """
            UPDATE users
            SET username=?, password=?, is_admin=?, base_dir=?, can_terminal=?, can_restart=?, can_info=?
            WHERE id=?
            """,
            (username, password, is_admin, base_dir, can_terminal, can_restart, can_info, user_id),
        )
        db.commit()

        return redirect(url_for("admin_panel"))

    return render_template("admin_edit_user.html", user=user)


# -------------------------
# USER EDIT OWN PROFILE
# -------------------------
@app.route("/profile/edit", methods=["GET", "POST"])
@login_required
def profile_edit():
    db = get_db()

    if request.method == "POST":
        username = request.form.get("username").strip()
        password = request.form.get("password").strip() or g.user["password"]

        db.execute(
            "UPDATE users SET username=?, password=? WHERE id=?",
            (username, password, g.user["id"]),
        )
        db.commit()

        return redirect(url_for("home"))

    return render_template("profile_edit.html", user=g.user)


# -------------------------
# FILE MANAGER (old UI)
# -------------------------
@app.route("/browse", defaults={"relpath": ""})
@app.route("/browse/<path:relpath>")
@login_required
def browse(relpath):
    return files(relpath)


@app.route("/files_shortcut/<name>")
@login_required
def files_shortcut(name):
    base = g.user["base_dir"]

    shortcuts = {
        "home": base,
        "desktop": os.path.join(base, "Desktop"),
        "downloads": os.path.join(base, "Downloads"),
        "documents": os.path.join(base, "Documents"),
        "pictures": os.path.join(base, "Pictures"),
        "music": os.path.join(base, "Music"),
        "videos": os.path.join(base, "Videos"),
        "thispc": base
    }

    if name not in shortcuts:
        abort(404)

    path = shortcuts[name]
    rel = os.path.relpath(path, base)
    if rel == ".":
        rel = ""

    return redirect(url_for("files", relpath=rel))


@app.route("/files/", defaults={"relpath": ""})
@app.route("/files/<path:relpath>")
@login_required
def files(relpath):
    base = g.user["base_dir"]
    abs_path = os.path.normpath(os.path.join(base, relpath))

    if not abs_path.startswith(base):
        abort(403)

    if not os.path.isdir(abs_path):
        abort(404)

    entries = []
    for name in sorted(os.listdir(abs_path)):
        full = os.path.join(abs_path, name)
        entries.append({
            "name": name,
            "is_dir": os.path.isdir(full),
            "relpath": os.path.join(relpath, name) if relpath else name,
        })

    return render_template("files.html", entries=entries, relpath=relpath, current_path=abs_path)


@app.route("/download/<path:relpath>")
@login_required
def download(relpath):
    base = g.user["base_dir"]
    abs_path = os.path.normpath(os.path.join(base, relpath))
    return send_file(abs_path, as_attachment=True)


@app.route("/delete/<path:relpath>")
@login_required
def delete(relpath):
    base = g.user["base_dir"]
    abs_path = os.path.normpath(os.path.join(base, relpath))

    if os.path.isdir(abs_path):
        os.rmdir(abs_path)
    else:
        os.remove(abs_path)

    return redirect(request.referrer or url_for("files"))


@app.route("/rename/<path:relpath>", methods=["POST"])
@login_required
def rename(relpath):
    base = g.user["base_dir"]
    old = os.path.normpath(os.path.join(base, relpath))
    new_name = request.form.get("new_name").strip()
    new = os.path.join(os.path.dirname(old), new_name)
    os.rename(old, new)
    return redirect(request.referrer or url_for("files"))


@app.route("/mkdir/<path:relpath>", methods=["POST"])
@login_required
def mkdir(relpath):
    base = g.user["base_dir"]
    folder = request.form.get("folder_name").strip()
    os.mkdir(os.path.join(base, relpath, folder))
    return redirect(request.referrer or url_for("files"))


@app.route("/upload/<path:relpath>", methods=["POST"])
@login_required
def upload(relpath):
    base = g.user["base_dir"]
    file = request.files["file"]
    file.save(os.path.join(base, relpath, file.filename))
    return redirect(request.referrer or url_for("files"))


# -------------------------
# TERMINAL
# -------------------------
@app.route("/terminal")
@login_required
def terminal():
    if not g.user["can_terminal"]:
        abort(403)
    return render_template("terminal.html")


# -------------------------
# RESTART SERVER
# -------------------------
@app.route("/restart-server", methods=["POST"])
@login_required
def restart_server():
    if not g.user["can_restart"]:
        abort(403)
    return redirect(url_for("home"))


# -------------------------
# INFO PAGE
# -------------------------
@app.route("/info")
@login_required
def info():
    if not g.user["can_info"]:
        abort(403)
    return render_template("info.html")


# -------------------------
# main
# -------------------------
if __name__ == "__main__":
    with app.app_context():
        init_db()
    app.run(host="0.0.0.0", port=5000)
