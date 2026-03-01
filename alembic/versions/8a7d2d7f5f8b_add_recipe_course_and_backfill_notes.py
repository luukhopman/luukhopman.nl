"""Add recipes.course and backfill recipes.notes for legacy tables.

Revision ID: 8a7d2d7f5f8b
Revises: 5fce83e28ada
Create Date: 2026-03-01 16:30:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "8a7d2d7f5f8b"
down_revision: str | None = "5fce83e28ada"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Apply schema changes."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("recipes"):
        return

    columns = {column["name"] for column in inspector.get_columns("recipes")}
    if "notes" not in columns:
        op.add_column("recipes", sa.Column("notes", sa.String(), nullable=True))
    if "course" not in columns:
        op.add_column("recipes", sa.Column("course", sa.String(), nullable=True))


def downgrade() -> None:
    """Rollback schema changes."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("recipes"):
        return

    columns = {column["name"] for column in inspector.get_columns("recipes")}
    if "course" in columns:
        op.drop_column("recipes", "course")
    if "notes" in columns:
        op.drop_column("recipes", "notes")

