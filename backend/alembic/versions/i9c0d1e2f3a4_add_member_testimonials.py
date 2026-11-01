"""add member_testimonials for landing quotes

Revision ID: i9c0d1e2f3a4
Revises: h8b9c0d1e2f3
Create Date: 2026-11-02 01:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "i9c0d1e2f3a4"
down_revision: Union[str, Sequence[str], None] = "h8b9c0d1e2f3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "member_testimonials",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("author_name", sa.String(length=120), nullable=False),
        sa.Column("author_meta", sa.String(length=160), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("member_testimonials")
