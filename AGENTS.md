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

## Server Workspace
This repository is the primary working tree on the production server at `/home/websiteadmin/website`. Work as `websiteadmin`; do not move the project back under `/root` or change its ownership. The production Next.js service runs as `websiteadmin` from `frontend/.next/standalone`, listens on `127.0.0.1:3000`, and is proxied by Nginx. Treat `.env.production` as a secret: never print, commit, overwrite, or include its values in logs or chat.

Interactive SSH logins automatically attach to the persistent `website` tmux session and select its `codex` window at the repository root. The `work` command performs the same attach manually, while `codex-website` starts Codex explicitly from an existing shell. Keep the `shell` tmux window available for direct terminal work. Do not start duplicate dev servers or bind another process to production port 3000.

## Effective Work Loop
At the start of a task, confirm the repository root and inspect `git status --short --branch`. Preserve unrelated user changes. Read the relevant code and tests before editing, keep changes scoped to the request, and prefer existing utilities and patterns over new abstractions. Never edit generated `.next/standalone` output directly; edit source under `frontend/` and rebuild it.

Before declaring work complete, inspect the diff and run the narrowest relevant checks. For non-trivial application changes, run `npm run test:run` and `npm run typecheck` from `frontend/`; run `npm run build` for production, configuration, dependency, or app-router changes. Report any check that cannot be run.

Pushing to GitHub is source control only. GitHub Actions deployment is intentionally disabled, and a push does not update the running production build. Do not restart or deploy production unless the user explicitly asks. When deployment is requested, first finish verification, commit, and push, then run `./scripts/deploy-production.sh` from the repository root. That command requires a clean tree whose current commit is already on `origin`; it builds in an isolated worktree, applies migrations, swaps the standalone build, restarts only `website.service`, and performs health checks with rollback on local failure. Do not bypass it or invoke its privileged restart helper directly. Avoid changing Nginx, certificates, the database, or unrelated services unless the task requires it.

## Commit and Push Policy
After completing and verifying each requested change, commit and push it automatically unless the user explicitly says not to. Review `git diff` first, stage only task-related files, and use a concise descriptive commit message. Never commit `.env.production`, credentials, `.next/`, `node_modules`, logs, database dumps, or other generated/runtime files. Push the current branch to `origin`; do not force-push, rewrite published history, amend unrelated commits, or discard user changes. If a push is rejected or authentication is unavailable, preserve the local commit and clearly report the blocker.
