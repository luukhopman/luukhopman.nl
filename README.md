# Website

A simple, fast personal website built using:
- **FastAPI** (Python 3.13 backend)
- **SQLModel** (SQLite Database)
- **Alembic** (Database migrations)
- **Vanilla JS & CSS** (Frontend)
- **uv** (Dependency & environment manager)

## ✨ Features

- Add, edit, and delete wishlist items with optional store and URL
- Group items by store with collapsible sections
- Pin favourite stores to the top
- Quick-add items to a specific store
- Soft-delete with recovery, and permanent deletion
- **Auto-cleanup**: acquired items are automatically moved to deleted after 7 days
- **Timestamps**: shows when items were acquired or deleted (e.g. "2 days ago")
- **Bulk clear**: clear all acquired/deleted items per store with a styled confirmation popup
- Store name autocomplete
- Notebook-themed UI with responsive mobile design

## 💻 Local Development

1. **Install uv:**
   ```bash
   curl -LsSf https://astral.sh/uv/install.sh | sh
   ```
2. **Setup the project & start the server:**
   ```bash
   uv sync
   # Optional: use Postgres; if omitted, SQLite (products.db) is used
   export DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DBNAME"
   uv run alembic upgrade head
   export APP_PASSWORD="your_password_here"
   uv run uvicorn app.main:app --reload
   ```
3. Visit `http://127.0.0.1:8000` in your browser.

## 🗄️ Database Migrations (Alembic)

This project uses [Alembic](https://alembic.sqlalchemy.org/) for database schema migrations. Migrations are automatically applied during deployment.

**Creating a new migration** (after modifying models in `app/database.py`):
```bash
uv run alembic revision --autogenerate -m "describe your change"
```

**Applying migrations locally:**
```bash
uv run alembic upgrade head
```

---

## 🚀 Deployment Guide (Google Cloud VPS)

This guide covers how to set up and deploy the complete application to a fresh Ubuntu Linux VPS on Google Cloud with Nginx, Systemd, and SSL.

### 1. Generating an SSH Key
Since Google Cloud requires key-based authentication, create an SSH key locally:
```bash
ssh-keygen -t ed25519 -f ~/.ssh/gcp_key -C "luuk" -N ""
```
* Take the output of `cat ~/.ssh/gcp_key.pub` and add it to your VM Instance under **SSH Keys** in the Google Cloud Console.

### 2. Initial VPS Setup
You must do this once to set up `Nginx` and `uv` on the server. Make sure you replace `YOUR_VPS_IP_ADDRESS` and `YOUR_USERNAME` where applicable.

Run the setup script from your local machine to automatically install dependencies and set up `systemd` and `nginx`:
```bash
APP_PASSWORD="your_password_here" \
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DBNAME" \
DOMAIN="luukhopman.nl" \
INCLUDE_WWW="true" \
LETSENCRYPT_EMAIL="you@example.com" \
ssh -o StrictHostKeyChecking=no -i ~/.ssh/gcp_key luuk@YOUR_VPS_IP_ADDRESS 'bash -s' < deploy.sh
```

### 3. Deploying Code Changes (The Fast Way)
When you've written new code or templates and want to push them to the live server, you do not need to use `git`. Instead, use `rsync` to sync your local folder directly into the server, bypassing Git completely:

```bash
# Push all code updates to the server efficiently
rsync -avzc --delete --exclude '.git' --exclude '.venv' --exclude '__pycache__' --exclude '.ruff_cache' --exclude 'products.db' -e 'ssh -o StrictHostKeyChecking=no -i ~/.ssh/gcp_key' ./ luuk@YOUR_VPS_IP_ADDRESS:/home/luuk/website/

# Run migrations and restart
ssh -o StrictHostKeyChecking=no -i ~/.ssh/gcp_key luuk@YOUR_VPS_IP_ADDRESS "cd ~/website && uv run alembic upgrade head && sudo systemctl restart fastapi-website"
```

### 4. Setting up custom domains and SSL (HTTPS)
The deploy script now configures SSL automatically with Certbot.

1. Add DNS records first:
   - `A` record: `luukhopman.nl` -> `YOUR_VPS_IP_ADDRESS`
   - `A` record: `www.luukhopman.nl` -> `YOUR_VPS_IP_ADDRESS`
2. Deploy with domain env vars:
   ```bash
   APP_PASSWORD="your_password_here" \
   DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DBNAME" \
   DOMAIN="luukhopman.nl" \
   INCLUDE_WWW="true" \
   LETSENCRYPT_EMAIL="you@example.com" \
   ssh -o StrictHostKeyChecking=no -i ~/.ssh/gcp_key luuk@YOUR_VPS_IP_ADDRESS 'bash -s' < deploy.sh
   ```
3. If you do not want `www`, set `INCLUDE_WWW="false"`.

### 5. Managing the Database
To reset the application totally empty (wipe the active SQLite database):
```bash
ssh -i ~/.ssh/gcp_key luuk@YOUR_VPS_IP_ADDRESS "sudo systemctl stop fastapi-website && rm -f /home/luuk/website/products.db && cd ~/website && uv run alembic upgrade head && sudo systemctl start fastapi-website"
```
Alembic will recreate all tables from the migration history when upgrading on an empty database.

---

## 🔁 Complete GitHub Actions CD Setup (Optional Alternative)
Though `rsync` is faster, if you prefer pushing your code to GitHub and having it automatically deploy, the repository contains a `.github/workflows/deploy.yml` file. Migrations are automatically applied before restarting the service.

**Requirements**:
1. Go to your GitHub repository -> Settings -> Secrets and Variables -> Actions
2. Add `VPS_IP` = `YOUR_VPS_IP_ADDRESS`
3. Add `VPS_USERNAME` = `luuk`
4. Add `SSH_PRIVATE_KEY` = (The complete textual output of `cat ~/.ssh/gcp_key`)
5. Add `APP_PASSWORD` = (Your desired login password for the app)
6. Add `DATABASE_URL` = (`postgresql://USER:PASSWORD@HOST:5432/DBNAME`)

Any push targeting the `master` branch will automatically be pulled and synced by the server.
