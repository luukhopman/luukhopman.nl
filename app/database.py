"""
Database module for Wishlist.

This module defines the SQLModel ORM models and database connection logic.
It uses SQLite for local file-based storage.
"""

import os
from collections.abc import Generator
from datetime import UTC, datetime

from sqlmodel import Field, Session, SQLModel, create_engine


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
sqlite_file_name: str = "products.db"
base_dir: str = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sqlite_path: str = os.path.join(base_dir, sqlite_file_name)
sqlite_url: str = f"sqlite:///{sqlite_path}"

# Check_same_thread=False is needed in FastAPI for SQLite
engine = create_engine(sqlite_url, connect_args={"check_same_thread": False})


def init_db() -> None:
    """Initialize the database by creating all tables if they do not exist."""
    SQLModel.metadata.create_all(engine)


def get_session() -> Generator[Session]:
    """Dependency generator that provides a database session."""
    with Session(engine) as session:
        yield session
