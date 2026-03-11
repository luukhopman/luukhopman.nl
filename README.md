# Website

Personal Next.js app with four tools behind one shared app login:
- `wishlist` for products to buy
- `todo` for lightweight task tracking
- `cookbook` for recipes
- `gifts` for private gift ideas per gifts user

The repository is now Node-only. The entire app lives in [frontend/](/media/luuk/ssd1/python/website/frontend): React UI, Next.js routes, PostgreSQL access, migrations, and tests.

## Stack

- Next.js
- React
- TypeScript
- Tailwind CSS
- Node.js route handlers
- PostgreSQL
- Vitest

## Environment

Required:
- `DATABASE_URL`

Optional:
- `APP_PASSWORD`
- `AUTH_COOKIE_DOMAIN`
- `DOMAIN`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`

`APP_PASSWORD` protects the app with a single shared login. If it is unset, auth is effectively disabled.
In the gifts section, any password entered acts as a personal token to unlock private gifts tied to that specific token. This relies on `APP_PASSWORD` to sign the session token securely.

## Local Development

Requirements:
- Node.js 20+
- a PostgreSQL database reachable through `DATABASE_URL`

Run locally:

```bash
cd frontend
npm ci
export DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DBNAME"
export APP_PASSWORD="your_password_here"
export GEMINI_API_KEY="your_gemini_api_key_here"
npm run migrate
npm run dev
```

Open `http://127.0.0.1:3000`.

If the dev server starts returning fallback 404 pages after route/layout changes, restart it with:

```bash
cd frontend
npm run dev:reset
```

Production build:

```bash
cd frontend
npm ci
npm run migrate
npm run build
npm run start -- --hostname 127.0.0.1 --port 3000
```

## Database Migrations

Apply pending migrations:

```bash
cd frontend
npm run migrate
```

Migrations are defined in [frontend/lib/server/migrations.ts](/media/luuk/ssd1/python/website/frontend/lib/server/migrations.ts) and tracked in the `schema_migrations` table.

## Testing

Run the regression suite:

```bash
cd frontend
npm run test:run
npm run typecheck
npm run build
```

The test suite covers backend helpers, parsing/normalization logic, migrations, app auth, gifts auth, and API route handlers.

## Deployment

Deployment is handled by [.github/workflows/deploy.yml](/media/luuk/ssd1/python/website/.github/workflows/deploy.yml).

On each push to `master`, the workflow:
- installs Node.js
- runs `npm ci`, `npm run typecheck`, `npm run test:run`, and `npm run build`
- copies the repo files needed for production to the VPS
- runs `npm run migrate` on the VPS
- restarts the `website` systemd service
- rewrites the Nginx config and manages SSL with Certbot when enabled

### Required GitHub Secrets

- `VPS_IP`
- `VPS_USERNAME`
- `SSH_PRIVATE_KEY`
- `DATABASE_URL`

### Optional GitHub Secrets

- `APP_PASSWORD`
- `AUTH_COOKIE_DOMAIN`
- `DOMAIN`
- `DOMAIN_WWW`
- `INCLUDE_WWW`
- `ENABLE_SSL`
- `LETSENCRYPT_EMAIL`
- `APP_SUBDOMAINS`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
