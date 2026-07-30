#!/usr/bin/env bash
# Start script for the Raspberry Pi Dashboard.
# Creates a virtual environment on first run, installs dependencies, then starts the app.
set -e

cd "$(dirname "$0")"

VENV=".venv"

# Create the virtual environment if it doesn't exist yet.
if [ ! -d "$VENV" ]; then
  echo "Creating virtual environment (one-time setup)…"
  python3 -m venv "$VENV"
fi

# Install/refresh dependencies quietly.
echo "Checking dependencies…"
"$VENV/bin/pip" install --quiet --upgrade pip
"$VENV/bin/pip" install --quiet -r requirements.txt

echo ""
echo "==============================================="
echo "  Pi Dashboard starting…"
echo "  Open http://<your-pi-ip>:5000 on any device"
echo "  on the same network."
echo "  First login: admin / admin123"
echo "==============================================="
echo ""

exec "$VENV/bin/python" app.py
