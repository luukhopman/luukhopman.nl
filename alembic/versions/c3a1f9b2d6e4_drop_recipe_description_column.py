"""Drop recipes.description.

Revision ID: c3a1f9b2d6e4
Revises: 8a7d2d7f5f8b
Create Date: 2026-03-10 12:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c3a1f9b2d6e4"
down_revision: str | None = "8a7d2d7f5f8b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Apply schema changes."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("recipes"):
        return

    columns = {column["name"] for column in inspector.get_columns("recipes")}
    if "description" in columns:
        op.drop_column("recipes", "description")


def downgrade() -> None:
    """Rollback schema changes."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("recipes"):
        return

    columns = {column["name"] for column in inspector.get_columns("recipes")}
    if "description" not in columns:
        op.add_column("recipes", sa.Column("description", sa.String(), nullable=True))
