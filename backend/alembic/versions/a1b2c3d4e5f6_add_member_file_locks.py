"""add_member_file_locks

Revision ID: a1b2c3d4e5f6
Revises: d4d03f2d4572
Create Date: 2026-10-19 10:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "d4d03f2d4572"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "member_file_locks",
        sa.Column("member_id", sa.Integer(), nullable=False),
        sa.Column("locked_by_user_id", sa.Integer(), nullable=False),
        sa.Column(
            "acquired_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "last_seen_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["locked_by_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["member_id"], ["members.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("member_id"),
    )
    op.create_index(
        op.f("ix_member_file_locks_locked_by_user_id"),
        "member_file_locks",
        ["locked_by_user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_member_file_locks_locked_by_user_id"),
        table_name="member_file_locks",
    )
    op.drop_table("member_file_locks")
