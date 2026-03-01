"""Database module for Wishlist."""

import os
from collections.abc import Generator
from datetime import UTC, datetime

from dotenv import load_dotenv
from sqlalchemy import text
from sqlmodel import Field, Session, SQLModel, create_engine

# Load .env from project root so DATABASE_URL is available at import time.
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(dotenv_path=os.path.join(PROJECT_ROOT, ".env"))


class ProductBase(SQLModel):
    """Base SQLModel class for Product shared properties."""

    name: str = Field(description="The name of the product to track")
    store: str | None = Field(
        default=None, description="Optional store or precise location to buy the item"
    )
    url: str | None = Field(
        default=None, description="Optional URL to the product page"
    )


class Product(ProductBase, table=True):
    """
    Main Product database model representing the products table.
    Contains business logic fields like acquired and is_deleted status.
    """

    __tablename__ = "products"

    id: int | None = Field(
        default=None, primary_key=True, description="The unique primary key"
    )
    acquired: bool = Field(
        default=False, description="Whether the item has been acquired yet"
    )
    is_deleted: bool = Field(
        default=False,
        description="Soft-delete flag to hide items without permanent removal",
    )
    acquired_at: str | None = Field(
        default=None, description="ISO timestamp of when the item was acquired"
    )
    deleted_at: str | None = Field(
        default=None, description="ISO timestamp of when the item was deleted"
    )
    created_at: str = Field(
        default_factory=lambda: datetime.now(UTC).isoformat(),
        description="ISO timestamp of when the record was created",
    )


class RecipeBase(SQLModel):
    """Base SQLModel class for Recipe shared properties."""

    title: str | None = Field(default=None, description="The name of the recipe")
    course: str | None = Field(
        default=None, description="Optional course label (e.g. Breakfast, Dinner)"
    )
    description: str | None = Field(default=None, description="Short description")
    url: str | None = Field(default=None, description="Optional URL to the recipe")
    ingredients: str | None = Field(
        default=None, description="Ingredients list (markdown or plain text)"
    )
    instructions: str | None = Field(
        default=None, description="Cooking instructions (markdown or plain text)"
    )
    notes: str | None = Field(default=None, description="Personal notes or tips")


class Recipe(RecipeBase, table=True):
    """Main Recipe model."""

    __tablename__ = "recipes"

    id: int | None = Field(default=None, primary_key=True)
    created_at: str = Field(
        default_factory=lambda: datetime.now(UTC).isoformat(),
    )


class RecipeCreate(RecipeBase):
    """Schema for creating a new recipe."""

    pass


class RecipeUpdate(SQLModel):
    """Schema for updating a recipe."""

    title: str | None = None
    course: str | None = None
    description: str | None = None
    url: str | None = None
    ingredients: str | None = None
    instructions: str | None = None
    notes: str | None = None


class ProductCreate(ProductBase):
    """Schema for creating a new product via the API."""

    pass


class ProductUpdate(SQLModel):
    """Schema for updating a product's state via the API."""

    name: str | None = None
    store: str | None = None
    url: str | None = None
    acquired: bool | None = None
    is_deleted: bool | None = None


# Database connection URL config
database_url_env = os.getenv("DATABASE_URL")

if database_url_env and database_url_env.startswith("postgres://"):
    # SQLAlchemy requires 'postgresql://' instead of 'postgres://'
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
    """Ensure the database is reachable.

    Schema changes are managed via Alembic migrations (not runtime create_all).
    """
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))


def get_session() -> Generator[Session]:
    """Dependency generator that provides a database session."""
    with Session(engine) as session:
        yield session
