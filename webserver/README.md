# PiSTG - Another Raspberry Pi Dashboard

A clean, modern web dashboard for Raspberry Pi — access it from any device on your local network using the Pi's IP address.

## Features

- **Live system info with graphs** — CPU usage, memory, CPU temperature, disk, network traffic, uptime
<img width="1280" height="604" alt="image" src="https://github.com/user-attachments/assets/fcedc6d1-362b-40a0-9360-2d0c6271f413" />

---

- **Online file explorer** — browse, download, upload, and delete files (admin can manage which folders each user can access)
<img width="1280" height="604" alt="image" src="https://github.com/user-attachments/assets/5cf124ff-77e8-4435-8f68-02739b353f97" />

--- 

- **Multi-user with roles** — an admin user can create users, assign folder access, change passwords, and edit profile names
<img width="1280" height="604" alt="image" src="https://github.com/user-attachments/assets/267912b5-feb0-4925-b146-ff4d4792f85f" />

--- 

- **Mobile-friendly** — responsive layout that works great on phones and tablets
<img width="219" height="510" alt="image" src="https://github.com/user-attachments/assets/9485561a-c5d8-4512-a108-61a5996d69de" />

--- 

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
<img width="604" height="604" alt="image" src="https://github.com/user-attachments/assets/6e2619d8-7ab4-48f0-8fda-c3bab4ffeaff" />


Log in and change the password right away from your profile page.

## Notes

- User accounts and folder permissions are stored in a local SQLite database (`pi_dashboard.db`).
- The file explorer is sandboxed to the folders the admin allows for each user.
