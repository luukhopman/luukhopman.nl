"""Add resource_versions for realtime sync.

Revision ID: 9b7d1e4a6c2f
Revises: c3a1f9b2d6e4
Create Date: 2026-03-10 22:20:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "9b7d1e4a6c2f"
down_revision: str | None = "c3a1f9b2d6e4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Apply schema changes."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if inspector.has_table("resource_versions"):
        return

    op.create_table(
        "resource_versions",
        sa.Column("resource", sa.String(length=64), primary_key=True, nullable=False),
        sa.Column("version", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
    )


def downgrade() -> None:
    """Rollback schema changes."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if inspector.has_table("resource_versions"):
        op.drop_table("resource_versions")
