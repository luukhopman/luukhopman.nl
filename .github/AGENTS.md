# Repository Guidelines

## Project Structure & Module Organization
`app/` contains the FastAPI application. `app/main.py` assembles the app, shared routers live in `app/routers/`, and feature code is grouped under `app/features/{wishlist,todo,cookbook}/` with colocated models, schemas, parsing, and routes. Static HTML/CSS/JS lives in `app/static/` with per-feature subfolders such as `app/static/todo/`. Database migrations live in `alembic/versions/`. Deployment automation is in `.github/workflows/deploy.yml`.

## Build, Test, and Development Commands
Use `uv` with Python 3.13.

- `uv sync` installs app and tooling dependencies into `.venv`.
- `uv run alembic upgrade head` applies the latest PostgreSQL schema migrations.
- `uv run uvicorn app.main:app --reload` starts the local server at `127.0.0.1:8000`.
- `uv run alembic revision --autogenerate -m "describe change"` creates a migration after model changes.
- `uv run ruff check .` runs linting and import-order checks.
- `uv run ty check` runs the configured type checker.

Set `DATABASE_URL` before running the app or migrations. `APP_PASSWORD` is optional for auth, and `GEMINI_API_KEY` is only needed for recipe parsing features.

## Coding Style & Naming Conventions
Follow the existing Python style: 4-space indentation, explicit type hints, and small feature-focused modules. Use `snake_case` for files, functions, and variables; use `PascalCase` for SQLModel and Pydantic classes. Ruff targets Python 3.13, enforces import sorting, and uses an 88-character line length baseline. Keep frontend assets named by feature and purpose, for example `app/static/recipes/recipes.js`.

## Testing Guidelines
There is no committed `tests/` suite yet, so contributors should treat linting, type checking, and manual smoke testing as the baseline. Before opening a PR, run `uv run ruff check .`, `uv run ty check`, and verify the affected flows locally, especially `/wishlist`, `/todo`, `/cookbook`, login, and any Alembic migration path you changed. If you add non-trivial business logic, introduce focused automated tests in a new `tests/` package.

## Commit & Pull Request Guidelines
Recent history uses short imperative subjects, sometimes with prefixes like `feat:`, `fix:`, or `chore:`. Keep commits scoped to one concern and mention schema changes directly. PRs should include a concise summary, any required env or migration changes, linked issues if applicable, and screenshots for UI work. Because pushes to `master` trigger VPS deployment, call out rollout risks before merge and do not merge broken migrations.

## Security & Configuration Tips
Never commit real secrets or production connection strings. PostgreSQL is required; SQLite is not supported. For deployment-related changes, verify `.github/workflows/deploy.yml` and document any new GitHub Actions secrets in `README.md`.
