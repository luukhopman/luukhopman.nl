from datetime import UTC, datetime

from sqlmodel import Field, SQLModel


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
    """Main Product database model representing the products table."""

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


class ProductStoreRename(SQLModel):
    """Schema for bulk-renaming a store across wishlist items."""

    old_store: str | None = None
    new_store: str | None = None
