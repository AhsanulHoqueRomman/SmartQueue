#!/usr/bin/env bash
# Exit immediately if a command exits with a non-zero status
set -o errexit

# Ensure execution from the directory containing this script (backend/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "==> Working directory: $(pwd)"
echo "==> Installing Python dependencies..."
pip install -r requirements.txt

echo "==> Collecting static assets..."
python manage.py collectstatic --noinput

echo "==> Build complete."
