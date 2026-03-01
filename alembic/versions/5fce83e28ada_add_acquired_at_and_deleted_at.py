"""Create baseline wishlist and recipes schema.

Revision ID: 5fce83e28ada
Revises:
Create Date: 2026-03-01 15:20:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "5fce83e28ada"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Apply schema changes."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("products"):
        op.create_table(
            "products",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("store", sa.String(), nullable=True),
            sa.Column("url", sa.String(), nullable=True),
            sa.Column("acquired", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("acquired_at", sa.String(), nullable=True),
            sa.Column("deleted_at", sa.String(), nullable=True),
            sa.Column("created_at", sa.String(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )
    else:
        product_columns = {column["name"] for column in inspector.get_columns("products")}
        if "acquired_at" not in product_columns:
            op.add_column("products", sa.Column("acquired_at", sa.String(), nullable=True))
        if "deleted_at" not in product_columns:
            op.add_column("products", sa.Column("deleted_at", sa.String(), nullable=True))

    if not inspector.has_table("recipes"):
        op.create_table(
            "recipes",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("title", sa.String(), nullable=True),
            sa.Column("description", sa.String(), nullable=True),
            sa.Column("url", sa.String(), nullable=True),
            sa.Column("ingredients", sa.String(), nullable=True),
            sa.Column("instructions", sa.String(), nullable=True),
            sa.Column("notes", sa.String(), nullable=True),
            sa.Column("created_at", sa.String(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )


def downgrade() -> None:
    """Rollback schema changes."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if inspector.has_table("recipes"):
        op.drop_table("recipes")
    if inspector.has_table("products"):
        op.drop_table("products")
