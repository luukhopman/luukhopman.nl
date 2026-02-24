#!/bin/bash
# Exit script if any command fails
set -e

echo "🚀 Starting Deployment of Wishlist..."

# 1. Install System Dependencies
echo "📦 Installing system dependencies..."
sudo apt update
sudo apt install -y git nginx curl

# 2. Install uv (if not already installed)
if ! command -v uv &> /dev/null
then
    echo "🐍 Installing uv..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    source $HOME/.local/bin/env
else
    echo "✅ uv is already installed"
fi

# 3. Clone or Update Repository
REPO_URL="https://github.com/luukhopman/todo.git"
APP_DIR="$HOME/todo"

if [ -d "$APP_DIR" ]; then
    echo "🔄 Updating existing repository..."
    cd $APP_DIR
    git pull origin master
else
    echo "📥 Cloning repository..."
    git clone $REPO_URL $APP_DIR
    cd $APP_DIR
fi

# 4. Install Python and dependencies using uv
echo "⚙️ Setting up Python environment..."
uv python install 3.13
uv sync
uv run alembic upgrade head

# 5. Setup Systemd Service
echo "🔧 Configuring systemd service..."
SERVICE_FILE="/etc/systemd/system/fastapi-todo.service"

sudo bash -c "cat > $SERVICE_FILE" << EOF
[Unit]
Description=Uvicorn daemon for FastAPI Todo App
After=network.target

[Service]
User=$USER
Group=www-data
WorkingDirectory=$APP_DIR
Environment="PATH=$APP_DIR/.venv/bin:/usr/local/bin:/usr/bin"
ExecStart=$APP_DIR/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 2
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable fastapi-todo
sudo systemctl restart fastapi-todo

# 6. Setup Nginx
echo "🌐 Configuring Nginx..."
NGINX_CONF="/etc/nginx/sites-available/fastapi-todo"

# Get the external IP address of the VPS
EXTERNAL_IP=$(curl -s ifconfig.me)

sudo bash -c "cat > $NGINX_CONF" << EOF
server {
    listen 80;
    server_name $EXTERNAL_IP;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

sudo ln -sf $NGINX_CONF /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx

# 7. Configure Firewall (Optional but recommended)
echo "🛡️ Configuring Firewall..."
sudo ufw allow 'Nginx Full' || true

echo "✅ Deployment Successful! You can access your app at: http://$EXTERNAL_IP"
