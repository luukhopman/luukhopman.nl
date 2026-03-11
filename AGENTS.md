# Repository Guidelines

## Project Structure
The active application lives in `frontend/`. Use the Next.js app router in `frontend/app/` for pages and route handlers, shared UI in `frontend/components/`, browser helpers in `frontend/lib/`, and server-only code in `frontend/lib/server/`. Static assets live in `frontend/public/`, shared styles in `frontend/styles/`, and regression tests in `frontend/tests/`.

## Development Commands
Run all app commands from `frontend/`.

- `npm ci` installs dependencies.
- `npm run dev` starts the local app on port 3000.
- `npm run dev:reset` clears stale Next build output before starting dev mode.
- `npm run migrate` applies PostgreSQL migrations.
- `npm run test:run` runs the Vitest suite.
- `npm run typecheck` runs TypeScript checks.
- `npm run build` verifies the production build.

Set `DATABASE_URL` before running migrations or server-side features. `APP_PASSWORD` is optional and disables shared-login auth when unset.

## Coding Style
Use TypeScript with strict typing and small feature-focused modules. Keep server logic out of client components. Prefer path aliases from `@/` for imports inside `frontend/`. Follow the existing naming patterns: `PascalCase` for React components, `camelCase` for functions and variables, and route/file names that match the feature they implement.

## Testing Expectations
Before handing off non-trivial changes, run the narrowest useful verification first, then broader checks if the area changed significantly. For backend or route changes, prefer `npm run test:run`. For config or app-router changes, also run `npm run build` when practical.

## Cleanup Rules
Do not commit generated output such as `.next/`, `node_modules/`, coverage files, or temporary test artifacts. The old FastAPI app has been removed; keep new work centered on the `frontend/` app unless the task is explicitly about repository history or deployment cleanup.
