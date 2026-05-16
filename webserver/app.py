from flask import Flask, render_template, request, send_from_directory, redirect, url_for, jsonify
import os
import platform
import datetime
import psutil
import subprocess
import threading
import time

app = Flask(__name__)

# USER HOME
USER_HOME = "/home/<YOUR_RASPBERRY_PI_USERNAME>"

# REAL SYSTEM FOLDERS (RELATIVE)
SHORTCUTS = {
    "home": "",
    "desktop": "Desktop",
    "downloads": "Downloads",
    "documents": "Documents",
    "pictures": "Pictures",
    "music": "Music",
    "videos": "Videos",
    "thispc": "",
}

# Convert relative → absolute
def to_full(rel):
    rel = rel.strip("/")
    return os.path.abspath(os.path.join(USER_HOME, rel))

# Security: allow only inside USER_HOME
def safe(relpath):
    full = to_full(relpath)
    if not full.startswith(USER_HOME):
        raise ValueError("Access denied")
    return full


@app.route("/")
def root():
    return render_template(
        "home.html",
        now=datetime.datetime.now(),
        os_info=platform.platform(),
        cpu=psutil.cpu_percent(),
        ram=psutil.virtual_memory().percent,
    )


# ---------- INFO ----------
@app.route("/info")
def info():
    vm = psutil.virtual_memory()
    return render_template(
        "info.html",
        os_info=platform.platform(),
        cpu=psutil.cpu_percent(),
        ram=vm.percent,
        ram_total=round(vm.total / (1024 ** 3), 2),
        ram_used=round(vm.used / (1024 ** 3), 2),
    )


@app.route("/info_data")
def info_data():
    vm = psutil.virtual_memory()
    return jsonify({"cpu": psutil.cpu_percent(), "ram": vm.percent})


# ---------- TERMINAL ----------
@app.route("/terminal")
def terminal():
    ls_output = subprocess.getoutput(f"ls -lah {USER_HOME}")
    tree_output = subprocess.getoutput(f"find {USER_HOME} -maxdepth 3")
    return render_template(
        "terminal.html",
        ls_output=ls_output,
        tree_output=tree_output,
        base_dir=USER_HOME,
    )


# ---------- SIDEBAR SHORTCUTS ----------
@app.route("/files_shortcut/<name>")
def files_shortcut(name):
    name = name.lower()
    if name in SHORTCUTS:
        return redirect(url_for("browse", relpath=SHORTCUTS[name]))
    return redirect(url_for("browse", relpath=""))


# ---------- FILE MANAGER ----------
@app.route("/files", defaults={"relpath": ""})
@app.route("/files/<path:relpath>")
def browse(relpath):
    full = safe(relpath)

    entries = []
    for name in os.listdir(full):
        item = os.path.join(full, name)
        entries.append({
            "name": name,
            "is_dir": os.path.isdir(item),
            "size": os.path.getsize(item) if os.path.isfile(item) else None
        })

    parent_rel = os.path.dirname(relpath)

    return render_template(
        "files.html",
        entries=entries,
        relpath=relpath,
        parent_rel=parent_rel,
        current_path=full
    )


# ---------- DOWNLOAD ----------
@app.route("/download/<path:relpath>")
def download(relpath):
    full = safe(relpath)
    directory = os.path.dirname(full)
    filename = os.path.basename(full)
    return send_from_directory(directory, filename, as_attachment=True)


# ---------- UPLOAD ----------
@app.route("/upload/<path:relpath>", methods=["POST"])
def upload(relpath):
    full = safe(relpath)
    f = request.files.get("file")
    if f and f.filename:
        f.save(os.path.join(full, f.filename))
    return redirect(url_for("browse", relpath=relpath))


# ---------- DELETE ----------
@app.route("/delete/<path:relpath>")
def delete(relpath):
    full = safe(relpath)
    if os.path.isfile(full):
        os.remove(full)
    return redirect(url_for("browse", relpath=os.path.dirname(relpath)))


# ---------- CREATE FOLDER ----------
@app.route("/mkdir/<path:relpath>", methods=["POST"])
def mkdir(relpath):
    full = safe(relpath)
    folder_name = request.form.get("folder_name", "").strip()
    if folder_name:
        os.makedirs(os.path.join(full, folder_name), exist_ok=True)
    return redirect(url_for("browse", relpath=relpath))


# ---------- RENAME ----------
@app.route("/rename/<path:relpath>", methods=["POST"])
def rename(relpath):
    full = safe(relpath)
    new_name = request.form.get("new_name", "").strip()
    if new_name:
        new_full = os.path.join(os.path.dirname(full), new_name)
        os.rename(full, new_full)
    return redirect(url_for("browse", relpath=os.path.dirname(relpath)))


# ---------- MOVE ----------
@app.route("/move/<path:relpath>", methods=["POST"])
def move(relpath):
    full = safe(relpath)
    target = request.form.get("target_path", "").strip()
    if target:
        target_full = safe(target)
        os.makedirs(target_full, exist_ok=True)
        os.rename(full, os.path.join(target_full, os.path.basename(full)))
        return redirect(url_for("browse", relpath=target))
    return redirect(url_for("browse", relpath=os.path.dirname(relpath)))


# ---------- RESTART ----------
def delayed_exit():
    time.sleep(1)
    os._exit(0)

@app.route("/restart")
def restart():
    threading.Thread(target=delayed_exit, daemon=True).start()
    return "Restarting server..."


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=80, debug=True)
