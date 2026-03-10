"""Shared database engine and session configuration."""

import os
from collections.abc import Generator

from dotenv import load_dotenv
from sqlalchemy import text
from sqlmodel import Session, create_engine

import app.features.cookbook.models  # noqa: F401
import app.features.todo.models  # noqa: F401
import app.features.wishlist.models  # noqa: F401
from app.features.cookbook.models import Recipe, RecipeCreate, RecipeUpdate
from app.features.todo.models import Todo, TodoCreate, TodoUpdate
from app.features.wishlist.models import (
    Product,
    ProductCreate,
    ProductStoreRename,
    ProductUpdate,
)

# Load .env from project root so DATABASE_URL is available at import time.
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(dotenv_path=os.path.join(PROJECT_ROOT, ".env"))

database_url_env = os.getenv("DATABASE_URL")

if database_url_env and database_url_env.startswith("postgres://"):
    database_url_env = database_url_env.replace("postgres://", "postgresql://", 1)

if not database_url_env:
    raise RuntimeError(
        "DATABASE_URL is required. Configure your Supabase Postgres connection string."
    )
if not database_url_env.startswith("postgresql://"):
    raise RuntimeError(
        "DATABASE_URL must be a PostgreSQL URL (expected Supabase). SQLite is disabled."
    )

DATABASE_URL: str = database_url_env

engine = create_engine(DATABASE_URL)


def init_db() -> None:
    """Ensure the database is reachable."""
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))


def get_session() -> Generator[Session]:
    """Dependency generator that provides a database session."""
    with Session(engine) as session:
        yield session


__all__ = [
    "DATABASE_URL",
    "Product",
    "ProductCreate",
    "ProductStoreRename",
    "ProductUpdate",
    "Recipe",
    "RecipeCreate",
    "RecipeUpdate",
    "Todo",
    "TodoCreate",
    "TodoUpdate",
    "engine",
    "get_session",
    "init_db",
]
