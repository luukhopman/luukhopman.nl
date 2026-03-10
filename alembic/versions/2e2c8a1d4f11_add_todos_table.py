"""Add todos table.

Revision ID: 2e2c8a1d4f11
Revises: 8a7d2d7f5f8b
Create Date: 2026-03-10 12:30:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "2e2c8a1d4f11"
down_revision: str | None = "8a7d2d7f5f8b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Apply schema changes."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if inspector.has_table("todos"):
        return

    op.create_table(
        "todos",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("due_date", sa.String(), nullable=True),
        sa.Column("completed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("completed_at", sa.String(), nullable=True),
        sa.Column("created_at", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    """Rollback schema changes."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if inspector.has_table("todos"):
        op.drop_table("todos")
