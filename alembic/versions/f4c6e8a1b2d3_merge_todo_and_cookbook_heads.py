"""Merge todo and cookbook/resource migration heads.

Revision ID: f4c6e8a1b2d3
Revises: 2e2c8a1d4f11, 9b7d1e4a6c2f
Create Date: 2026-03-10 23:10:00.000000
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f4c6e8a1b2d3"
down_revision: tuple[str, str] | None = ("2e2c8a1d4f11", "9b7d1e4a6c2f")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Merge the two heads without additional schema changes."""
    pass


def downgrade() -> None:
    """Split the merged heads again without additional schema changes."""
    pass
