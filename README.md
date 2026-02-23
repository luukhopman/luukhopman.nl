# Shared Product Tracker

A simple, fast Shared Product Tracker built using:
- **FastAPI** (Python 3.13 backend)
- **SQLModel** (SQLite Database)
- **Vanilla JS & CSS** (Frontend)
- **uv** (Dependency & environment manager)

## 💻 Local Development

1. **Install uv:**
   ```bash
   curl -LsSf https://astral.sh/uv/install.sh | sh
   ```
2. **Setup the project & start the server:**
   ```bash
   uv sync
   uv run uvicorn main:app --reload
   ```
3. Visit `http://127.0.0.1:8000` in your browser.

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
ssh -o StrictHostKeyChecking=no -i ~/.ssh/gcp_key luuk@YOUR_VPS_IP_ADDRESS 'bash -s' < deploy.sh
```

### 3. Deploying Code Changes (The Fast Way)
When you've written new code or templates and want to push them to the live server, you do not need to use `git`. Instead, use `rsync` to sync your local folder directly into the server, bypassing Git completely:

```bash
# Push all code updates to the server efficiently
rsync -avzc --delete --exclude '.git' --exclude '.venv' --exclude '__pycache__' --exclude '.ruff_cache' -e 'ssh -o StrictHostKeyChecking=no -i ~/.ssh/gcp_key' ./ luuk@YOUR_VPS_IP_ADDRESS:/home/luuk/todo/

# Important: Restart the system service so it picks up the latest code!
ssh -o StrictHostKeyChecking=no -i ~/.ssh/gcp_key luuk@YOUR_VPS_IP_ADDRESS "sudo systemctl restart fastapi-todo"
```

### 4. Setting up custom domains and SSL (HTTPS)
If you bought a domain name (e.g., `todo.luukhopman.nl`) and added two **A Records** on your DNS provider (e.g., Porkbun) pointing exactly to your VPS IP:

1. **Update Nginx block** on the server to listen to the domain:
   ```nginx
   server {
       listen 80;
       server_name todo.luukhopman.nl www.todo.luukhopman.nl;
   
       location / {
           proxy_pass http://127.0.0.1:8000;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```
2. **Restart Nginx** over SSH:
   ```bash
   ssh -i ~/.ssh/gcp_key luuk@YOUR_VPS_IP_ADDRESS "sudo nginx -t && sudo systemctl restart nginx"
   ```
3. **Generate your free SSL certificate** with Certbot over SSH:
   ```bash
   ssh -i ~/.ssh/gcp_key luuk@YOUR_VPS_IP_ADDRESS "sudo apt-get install -y certbot python3-certbot-nginx && sudo certbot --nginx -n -d todo.luukhopman.nl -d www.todo.luukhopman.nl --redirect"
   ```

### 5. Managing the Database / Wiping it Clean
To reset the application totally empty (wipe the active SQLite database):
```bash
ssh -i ~/.ssh/gcp_key luuk@YOUR_VPS_IP_ADDRESS "sudo systemctl stop fastapi-todo && rm -f /home/luuk/todo/products.db && sudo systemctl start fastapi-todo"
```
Because SQLModel creates tables automatically on boot, deleting the file safely clears all data and reconstructs an empty DB when the service restarts.

---

## 🔁 Complete GitHub Actions CD Setup (Optional Alternative)
Though `rsync` is faster, if you prefer pushing your code to GitHub and having it automatically deploy, the repository contains a `.github/workflows/deploy.yml` file.

**Requirements**:
1. Go to your GitHub repository -> Settings -> Secrets and Variables -> Actions
2. Add `VPS_IP` = `YOUR_VPS_IP_ADDRESS`
3. Add `VPS_USERNAME` = `luuk`
4. Add `SSH_PRIVATE_KEY` = (The complete textual output of `cat ~/.ssh/gcp_key`)

Any push targeting the `master` branch will automatically be pulled and synced by the server.
