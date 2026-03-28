set -euo pipefail

APP_DIR="$HOME/website"
SERVICE_NAME="website"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
NGINX_CONF="/etc/nginx/sites-available/${SERVICE_NAME}"
LEGACY_NGINX_SITE="fastapi-website"

ROOT_DOMAIN="${DOMAIN:-luukhopman.nl}"
AUTH_COOKIE_DOMAIN="${AUTH_COOKIE_DOMAIN:-$ROOT_DOMAIN}"
INCLUDE_WWW="${INCLUDE_WWW:-true}"
WWW_DOMAIN="${DOMAIN_WWW:-www.${ROOT_DOMAIN}}"
ENABLE_SSL="${ENABLE_SSL:-true}"
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-}"
APP_SUBDOMAINS="${APP_SUBDOMAINS:-wishlist cookbook todo gifts garden}"
DATABASE_URL="${DATABASE_URL:-}"
EXTERNAL_IP=""

build_primary_domain_list() {
  local domains=()

  if [ -n "$ROOT_DOMAIN" ]; then
    domains+=("$ROOT_DOMAIN")
    if [ "$INCLUDE_WWW" = "true" ]; then
      domains+=("$WWW_DOMAIN")
    fi
  else
    domains+=("$EXTERNAL_IP")
  fi

  printf '%s\n' "${domains[@]}"
}

build_redirect_domain_list() {
  local domains=()

  if [ -n "$ROOT_DOMAIN" ]; then
    for subdomain in $APP_SUBDOMAINS; do
      domains+=("${subdomain}.${ROOT_DOMAIN}")
    done
  fi

  printf '%s\n' "${domains[@]}"
}

build_certbot_domain_list() {
  build_primary_domain_list
  build_redirect_domain_list
}

render_redirect_server_blocks() {
  if [ -z "$ROOT_DOMAIN" ]; then
    return
  fi

  for subdomain in $APP_SUBDOMAINS; do
    cat <<EOF_REDIRECT
server {
    listen 80;
    server_name ${subdomain}.${ROOT_DOMAIN};

    return 307 \$scheme://${ROOT_DOMAIN}/${subdomain}\$is_args\$args;
}

EOF_REDIRECT
  done
}

run_certbot_with_retry() {
  local certbot_output=""
  local attempt=0
  local max_attempts=4

  while [ "$attempt" -lt "$max_attempts" ]; do
    attempt=$((attempt + 1))

    if certbot_output="$(timeout 180 sudo certbot "${CERTBOT_ARGS[@]}" 2>&1)"; then
      printf '%s\n' "$certbot_output"
      return 0
    fi

    printf '%s\n' "$certbot_output"

    if ! printf '%s' "$certbot_output" | grep -q "Another instance of Certbot is already running."; then
      return 1
    fi

    if [ "$attempt" -ge "$max_attempts" ]; then
      return 1
    fi

    echo "Certbot is busy; retrying in 20 seconds (attempt $((attempt + 1))/$max_attempts)..."
    sleep 20
  done
}

certificate_covers_domains() {
  local cert_path="/etc/letsencrypt/live/${ROOT_DOMAIN}/fullchain.pem"
  local cert_domains=""
  local requested_domain=""

  if [ ! -f "$cert_path" ]; then
    return 1
  fi

  cert_domains="$(sudo openssl x509 -in "$cert_path" -noout -ext subjectAltName 2>/dev/null || true)"
  if [ -z "$cert_domains" ]; then
    return 1
  fi

  while IFS= read -r requested_domain; do
    [ -n "$requested_domain" ] || continue
    if ! printf '%s\n' "$cert_domains" | grep -Fq "DNS:${requested_domain}"; then
      return 1
    fi
  done < <(build_certbot_domain_list)

  return 0
}

exec 9>"$HOME/.website-deploy.lock"
if ! flock -w 30 9; then
  echo "Another deploy is still running on the VPS."
  exit 1
fi

echo "Starting remote deploy..."
mkdir -p "$APP_DIR"

if [ -f "$HOME/website-frontend-deploy.tar.gz" ]; then
  echo "Extracting application bundle..."
  rm -rf "$APP_DIR/frontend"
  tar -xzf "$HOME/website-frontend-deploy.tar.gz" -C "$APP_DIR"
  rm -f "$HOME/website-frontend-deploy.tar.gz"
fi

cd "$APP_DIR"

echo "Ensuring system packages are installed..."
if ! command -v nginx >/dev/null || ! command -v certbot >/dev/null; then
  sudo apt-get update -y
  sudo apt-get install -y nginx curl certbot python3-certbot-nginx ca-certificates gnupg
fi

echo "Ensuring Node.js 20 is installed..."
NODE_MAJOR_VERSION="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
if [ "$NODE_MAJOR_VERSION" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

cd "$APP_DIR/frontend"

echo "Running database migrations..."
node .next/standalone/deploy/scripts/migrate.js

echo "Syncing public and static files for standalone mode..."
cp -r public .next/standalone/ 2>/dev/null || true
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/ 2>/dev/null || true

cd "$APP_DIR"

echo "Updating application service..."
ENV_FILE="$APP_DIR/.env.production"
cat <<ENVEOF | sudo tee "$ENV_FILE" > /dev/null
APP_PASSWORD=${APP_PASSWORD:-}
AUTH_COOKIE_DOMAIN=${AUTH_COOKIE_DOMAIN:-}
DATABASE_URL=${DATABASE_URL:-}
DOMAIN=${ROOT_DOMAIN:-}
GEMINI_API_KEY=${GEMINI_API_KEY:-}
GEMINI_MODEL=${GEMINI_MODEL:-}
GIFTS_PASSWORD=${GIFTS_PASSWORD:-}
GIFTS_USERS=${GIFTS_USERS:-}
PORT=3000
HOSTNAME=127.0.0.1
ENVEOF
sudo chmod 600 "$ENV_FILE"

cat <<SERVICEEOF | sudo tee "$SERVICE_FILE" > /dev/null
[Unit]
Description=Next.js Website App
After=network.target

[Service]
User=$USER
Group=www-data
WorkingDirectory=$APP_DIR/frontend/.next/standalone
Environment="PATH=/usr/local/bin:/usr/bin"
Environment="NODE_ENV=production"
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/node server.js
Restart=always

[Install]
WantedBy=multi-user.target
SERVICEEOF

sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"
sudo systemctl restart "$SERVICE_NAME"

echo "Updating nginx configuration..."
if [ -z "$ROOT_DOMAIN" ]; then
  EXTERNAL_IP="$(curl -fsS --max-time 5 ifconfig.me || hostname -I | awk '{print $1}')"
fi
SERVER_NAMES="$(build_primary_domain_list | tr '\n' ' ' | xargs)"
REDIRECT_SERVER_BLOCKS="$(render_redirect_server_blocks)"
NGINX_BACKUP="$(mktemp)"

if [ -f "$NGINX_CONF" ]; then
  sudo cp "$NGINX_CONF" "$NGINX_BACKUP"
fi

cat <<NGINXEOF | sudo tee "$NGINX_CONF" > /dev/null
server {
    listen 80;
    server_name $SERVER_NAMES;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}

$REDIRECT_SERVER_BLOCKS
NGINXEOF

sudo ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/
sudo rm -f "/etc/nginx/sites-enabled/${LEGACY_NGINX_SITE}"
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
if systemctl is-active --quiet nginx; then
  sudo systemctl reload nginx
else
  sudo systemctl restart nginx
fi

if command -v ufw >/dev/null 2>&1; then
  sudo ufw allow 'Nginx Full' || true
fi

if [ "$ENABLE_SSL" = "true" ] && [ -n "$ROOT_DOMAIN" ]; then
  if certificate_covers_domains; then
    echo "Existing certificate already covers requested domains; skipping Certbot."
  else
    echo "Updating TLS certificate..."
    CERTBOT_ARGS=(--nginx -n --agree-tos --redirect --expand --cert-name "$ROOT_DOMAIN")
    if [ -n "$LETSENCRYPT_EMAIL" ]; then
      CERTBOT_ARGS+=(--email "$LETSENCRYPT_EMAIL")
    else
      CERTBOT_ARGS+=(--register-unsafely-without-email)
    fi

    while IFS= read -r domain; do
      CERTBOT_ARGS+=(-d "$domain")
    done < <(build_certbot_domain_list)

    if ! run_certbot_with_retry; then
      if [ -s "$NGINX_BACKUP" ]; then
        sudo cp "$NGINX_BACKUP" "$NGINX_CONF"
        sudo nginx -t
        if systemctl is-active --quiet nginx; then
          sudo systemctl reload nginx
        else
          sudo systemctl restart nginx
        fi
      fi
      exit 1
    fi
  fi
fi

rm -f "$NGINX_BACKUP"
echo "Remote deploy finished."
