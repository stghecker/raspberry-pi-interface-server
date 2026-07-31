# Pi-Apps Package for Pi Dashboard

This folder contains everything needed to add **Pi Dashboard** to [Pi-Apps](https://pi-apps.io/), the Raspberry Pi app store.

## File structure

```
pi-apps/
  Pi Dashboard/
    install         — bash script that installs the app
    uninstall       — bash script that removes the app
    description     — short description shown in the app list
    credits         — author / source attribution
    website         — project URL
    icon-24.png     — small icon (24x24)
    icon-64.png     — large icon (64x64)
```

## How to install this app into Pi-Apps

### Option 1: Copy into your local Pi-Apps folder

If you already have Pi-Apps installed:

```bash
cp -r "pi-apps/Pi Dashboard" ~/pi-apps/apps/
```

Pi Dashboard will now appear in your Pi-Apps list under the category that matches its description.

### Option 2: Install directly (without Pi-Apps)

```bash
cd "pi-apps/Pi Dashboard"
chmod +x install uninstall
./install
```

## What the install script does

1. Installs `python3`, `python3-venv`, and `python3-pip` via apt (or the Pi-Apps `install_packages` helper if available)
2. Clones the app repository to `~/Pi-Dashboard` (or copies from a local path if `PI_DASHBOARD_LOCAL` is set)
3. Creates an isolated Python virtual environment (avoids the "externally-managed-environment" error on Bookworm)
4. Installs Flask and psutil into the venv
5. Creates a desktop menu entry (System → Pi Dashboard)
6. Creates a `launch.sh` convenience script

## Environment variables for custom sources

| Variable | Default | Purpose |
|---|---|---|
| `PI_DASHBOARD_REPO` | `https://github.com/yourusername/pi-dashboard.git` | Git repo to clone from |
| `PI_DASHBOARD_BRANCH` | `main` | Git branch to check out |
| `PI_DASHBOARD_LOCAL` | *(unset)* | If set, copies from this local directory instead of cloning |

## Before submitting to the official Pi-Apps repo

1. **Update the GitHub URL** — replace `yourusername` in `install`, `credits`, and `website` with your actual GitHub username or the real repository URL.
2. **Test on a Pi** — run the install and uninstall scripts on a real Raspberry Pi to verify they work end-to-end.
3. **Check the category** — Pi-Apps categorizes apps; this would go under "System" or "Internet".
4. **Submit a PR** — fork the [Botspot/pi-apps](https://github.com/Botspot/pi-apps) repo, add your app folder under `apps/`, and open a pull request.

## Uninstall behavior

The uninstall script preserves your user database (`pi_dashboard.db`) by backing it up to `~/pi_dashboard_backup.db`. If you reinstall later, the database is automatically restored, so your user accounts, folder permissions, and theme settings are not lost.
