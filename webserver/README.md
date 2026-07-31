# Raspberry Pi Dashboard

A clean, modern web dashboard for Raspberry Pi — access it from any device on your local network using the Pi's IP address.

## Features

- **Live system info with graphs** — CPU usage, memory, CPU temperature, disk, network traffic, uptime
- **Online file explorer** — browse, download, upload, and delete files (admin can manage which folders each user can access)
- **Multi-user with roles** — an admin user can create users, assign folder access, change passwords, and edit profile names
- **Mobile-friendly** — responsive layout that works great on phones and tablets

## Run it on your Pi

This project includes a start script that handles everything for you — it creates an isolated Python environment (so you never hit the "externally-managed-environment" error) and installs the dependencies automatically.

```bash
chmod +x start.sh
./start.sh
```

The first run takes a little longer while it sets up the environment. After that it starts instantly. Then open a browser on any device on the same network and go to:

```
http://<your-pi-ip>:5000
```

The first time it starts, a default admin account is created:

- **Username:** `admin`
- **Password:** `admin123`

Log in and change the password right away from your profile page.

## Notes

- User accounts and folder permissions are stored in a local SQLite database (`pi_dashboard.db`).
- The file explorer is sandboxed to the folders the admin allows for each user.
