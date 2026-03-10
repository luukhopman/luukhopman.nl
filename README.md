# Website

Personal FastAPI app with three small tools behind one login:
- `wishlist` for products to buy
- `todo` for lightweight task tracking
- `cookbook` for recipes

## Stack

- FastAPI
- SQLModel
- PostgreSQL
- Alembic
- Vanilla JS/CSS
- `uv`

## Local Development

Requirements:
- Python 3.13
- `uv`
- a PostgreSQL database reachable through `DATABASE_URL`

Start the app:

```bash
uv sync
export DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DBNAME"
export APP_PASSWORD="your_password_here"
export GEMINI_API_KEY="your_gemini_api_key_here"
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

Open `http://127.0.0.1:8000`.

Notes:
- `DATABASE_URL` is required. SQLite is not supported.
- `APP_PASSWORD` is optional. If unset, auth is effectively disabled.
- `AUTH_COOKIE_DOMAIN` is optional. Set it to the parent domain, such as `luukhopman.nl`, when one login should work across subdomains.
- `GEMINI_API_KEY` is only needed for recipe parsing features.

## Migrations

Create a migration:

```bash
uv run alembic revision --autogenerate -m "describe change"
```

Apply migrations:

```bash
uv run alembic upgrade head
```

## Deployment

Deployment is handled only through GitHub Actions via [.github/workflows/deploy.yml](/media/luuk/ssd1/python/website/.github/workflows/deploy.yml).

On each push to `master`, the workflow:
- SSHes into the VPS
- updates `~/website` from the repo
- installs system packages and Python dependencies if needed
- runs Alembic migrations
- rewrites the `systemd` service
- rewrites the Nginx config
- provisions or renews SSL with Certbot when enabled

Push to deploy:

```bash
git push origin master
```

### Required GitHub Secrets

- `VPS_IP`
- `VPS_USERNAME`
- `SSH_PRIVATE_KEY`
- `DATABASE_URL`

### Optional GitHub Secrets

- `APP_PASSWORD`
- `AUTH_COOKIE_DOMAIN`
- `DATABASE_URL_FALLBACK`
- `DOMAIN`
- `DOMAIN_WWW`
- `INCLUDE_WWW`
- `ENABLE_SSL`
- `LETSENCRYPT_EMAIL`
- `APP_SUBDOMAINS`
- `GEMINI_API_KEY`

### VPS Expectations

- the deploy user can SSH into the server
- the deploy user has `sudo` privileges
- DNS is already pointed at the VPS before SSL is enabled

## Database Operations

Manual migration on the server:

```bash
ssh -i ~/.ssh/gcp_key luuk@YOUR_VPS_IP_ADDRESS \
  "cd ~/website && DATABASE_URL='postgresql://USER:PASSWORD@HOST:5432/DBNAME' uv run alembic upgrade head && sudo systemctl restart fastapi-website"
```
