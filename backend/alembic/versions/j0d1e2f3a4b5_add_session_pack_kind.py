"""add membership_plans.session_pack_kind

Revision ID: j0d1e2f3a4b5
Revises: i9c0d1e2f3a4
Create Date: 2026-11-02 23:50:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "j0d1e2f3a4b5"
down_revision: Union[str, Sequence[str], None] = "i9c0d1e2f3a4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "membership_plans",
        sa.Column("session_pack_kind", sa.String(length=16), nullable=True),
    )
    # Seed-ish names: best-effort classify existing rows (safe, idempotent).
    op.execute(
        sa.text(
            """
            UPDATE membership_plans
            SET session_pack_kind = 'pt'
            WHERE session_count IS NOT NULL
              AND session_pack_kind IS NULL
              AND (name LIKE '%مربی%' OR description LIKE '%خصوصی%')
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE membership_plans
            SET session_pack_kind = 'class'
            WHERE session_count IS NOT NULL
              AND session_pack_kind IS NULL
              AND (name LIKE '%کلاس%' OR description LIKE '%کلاس%')
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE membership_plans
            SET session_pack_kind = 'any'
            WHERE session_count IS NOT NULL
              AND session_pack_kind IS NULL
            """
        )
    )


def downgrade() -> None:
    op.drop_column("membership_plans", "session_pack_kind")
