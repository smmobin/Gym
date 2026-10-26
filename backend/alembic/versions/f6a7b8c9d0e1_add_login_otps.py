"""add_login_otps

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-10-27 00:50:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f6a7b8c9d0e1"
down_revision: Union[str, Sequence[str], None] = "e5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "login_otps",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("mobile", sa.String(length=20), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=True),
        sa.Column("code_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempts", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_login_otps_mobile"), "login_otps", ["mobile"], unique=False)
    op.create_index(
        "ix_login_otps_identity",
        "login_otps",
        ["mobile", "kind", "role"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_login_otps_identity", table_name="login_otps")
    op.drop_index(op.f("ix_login_otps_mobile"), table_name="login_otps")
    op.drop_table("login_otps")
