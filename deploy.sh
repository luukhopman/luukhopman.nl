#!/bin/bash
set -euo pipefail

echo "🚀 Starting Deployment of Website..."

REPO_URL="https://github.com/luukhopman/website.git"
APP_DIR="$HOME/website"
LEGACY_APP_DIR="$HOME/todo"
SERVICE_NAME="fastapi-website"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
LEGACY_SERVICE_NAME="fastapi-todo"
LEGACY_SERVICE_FILE="/etc/systemd/system/${LEGACY_SERVICE_NAME}.service"
NGINX_CONF="/etc/nginx/sites-available/${SERVICE_NAME}"

ROOT_DOMAIN="${DOMAIN:-luukhopman.nl}"
INCLUDE_WWW="${INCLUDE_WWW:-true}"
WWW_DOMAIN="${DOMAIN_WWW:-www.${ROOT_DOMAIN}}"
ENABLE_SSL="${ENABLE_SSL:-true}"
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-}"

install_system_deps() {
    echo "📦 Installing system dependencies..."
    sudo apt update
    sudo apt install -y git nginx curl certbot python3-certbot-nginx
}

install_uv_if_missing() {
    if ! command -v uv &>/dev/null; then
        echo "🐍 Installing uv..."
        curl -LsSf https://astral.sh/uv/install.sh | sh
        source "$HOME/.local/bin/env"
    else
        echo "✅ uv is already installed"
    fi
}

prepare_repo() {
    if [ ! -d "$APP_DIR" ] && [ -d "$LEGACY_APP_DIR" ]; then
        echo "📁 Migrating app directory from $LEGACY_APP_DIR to $APP_DIR..."
        mv "$LEGACY_APP_DIR" "$APP_DIR"
    fi

    if [ -d "$APP_DIR" ]; then
        echo "🔄 Updating existing repository..."
        cd "$APP_DIR"
        git pull origin master
    else
        echo "📥 Cloning repository..."
        git clone "$REPO_URL" "$APP_DIR"
        cd "$APP_DIR"
    fi
}

setup_python_and_dependencies() {
    echo "⚙️ Setting up Python environment..."
    uv python install 3.13

    if [ -d "$APP_DIR/.venv" ]; then
        echo "🔐 Fixing virtualenv ownership..."
        sudo chown -R "$USER":"$USER" "$APP_DIR/.venv"
    fi

    uv sync
}

run_migrations() {
    echo "🗄️ Running database migrations..."

    local migration_output
    local migration_status

    set +e
    migration_output=$(DATABASE_URL="${DATABASE_URL:-}" uv run alembic upgrade head 2>&1)
    migration_status=$?
    set -e

    if [ $migration_status -eq 0 ]; then
        return
    fi

    echo "$migration_output"

    if echo "$migration_output" | grep -qi "Network is unreachable" && echo "${DATABASE_URL:-}" | grep -qi "supabase.co"; then
        echo ""
        echo "❌ Supabase connectivity issue detected."
        echo "Your server cannot currently reach the Supabase DB host over IPv6."
        echo "Use the Supabase pooler connection string (IPv4-capable) as DATABASE_URL."
        echo "Make sure the URL includes sslmode=require."
        echo ""
        echo "Optional: set DATABASE_URL_FALLBACK and deploy will retry migrations with it."
    fi

    if [ -n "${DATABASE_URL_FALLBACK:-}" ]; then
        echo "🔁 Retrying migrations with DATABASE_URL_FALLBACK..."
        DATABASE_URL="$DATABASE_URL_FALLBACK" uv run alembic upgrade head
        return
    fi

    exit $migration_status
}

configure_systemd() {
    echo "🔧 Configuring systemd service..."

    if [ -f "$LEGACY_SERVICE_FILE" ]; then
        echo "🧹 Removing legacy ${LEGACY_SERVICE_NAME} service..."
        sudo systemctl disable --now "$LEGACY_SERVICE_NAME" || true
        sudo rm -f "$LEGACY_SERVICE_FILE"
    fi

    sudo bash -c "cat > '$SERVICE_FILE'" <<EOF_SERVICE
[Unit]
Description=Uvicorn daemon for FastAPI Website App
After=network.target

[Service]
User=$USER
Group=www-data
WorkingDirectory=$APP_DIR
Environment=\"PATH=$APP_DIR/.venv/bin:/usr/local/bin:/usr/bin\"
Environment=\"APP_PASSWORD=${APP_PASSWORD:-}\"
Environment=\"DATABASE_URL=${DATABASE_URL:-}\"
ExecStart=$APP_DIR/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 2
Restart=always

[Install]
WantedBy=multi-user.target
EOF_SERVICE

    sudo systemctl daemon-reload
    sudo systemctl enable "$SERVICE_NAME"
    sudo systemctl restart "$SERVICE_NAME"
}

configure_nginx() {
    echo "🌐 Configuring Nginx..."

    EXTERNAL_IP=$(curl -s ifconfig.me)

    if [ -n "$ROOT_DOMAIN" ]; then
        if [ "$INCLUDE_WWW" = "true" ]; then
            SERVER_NAMES="$ROOT_DOMAIN $WWW_DOMAIN"
        else
            SERVER_NAMES="$ROOT_DOMAIN"
        fi
    else
        SERVER_NAMES="$EXTERNAL_IP"
    fi

    sudo bash -c "cat > '$NGINX_CONF'" <<EOF_NGINX
server {
    listen 80;
    server_name $SERVER_NAMES;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF_NGINX

    sudo ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/
    sudo rm -f /etc/nginx/sites-enabled/default
    sudo nginx -t
    sudo systemctl restart nginx
}

configure_ssl() {
    if [ "$ENABLE_SSL" != "true" ] || [ -z "$ROOT_DOMAIN" ]; then
        return
    fi

    echo "🔒 Configuring SSL with Certbot..."

    local certbot_args=(--nginx -n --agree-tos --redirect)
    if [ -n "$LETSENCRYPT_EMAIL" ]; then
        certbot_args+=(--email "$LETSENCRYPT_EMAIL")
    else
        certbot_args+=(--register-unsafely-without-email)
    fi

    certbot_args+=(-d "$ROOT_DOMAIN")
    if [ "$INCLUDE_WWW" = "true" ]; then
        certbot_args+=(-d "$WWW_DOMAIN")
    fi

    sudo certbot "${certbot_args[@]}"
}

configure_firewall() {
    echo "🛡️ Configuring Firewall..."
    sudo ufw allow 'Nginx Full' || true
}

print_success() {
    if [ "$ENABLE_SSL" = "true" ] && [ -n "$ROOT_DOMAIN" ]; then
        echo "✅ Deployment Successful! You can access your app at: https://$ROOT_DOMAIN"
    else
        echo "✅ Deployment Successful! You can access your app at: http://$EXTERNAL_IP"
    fi
}

install_system_deps
install_uv_if_missing
prepare_repo
setup_python_and_dependencies
run_migrations
configure_systemd
configure_nginx
configure_ssl
configure_firewall
print_success
