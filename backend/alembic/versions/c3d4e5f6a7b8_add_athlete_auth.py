"""add_athlete_auth

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-10-19 19:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, Sequence[str], None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "members",
        sa.Column("password_hash", sa.String(length=255), nullable=True),
    )

    op.create_table(
        "athlete_sessions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("member_id", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("user_agent", sa.String(length=255), nullable=True),
        sa.ForeignKeyConstraint(["member_id"], ["members.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_athlete_sessions_token_hash"),
        "athlete_sessions",
        ["token_hash"],
        unique=True,
    )
    op.create_index(
        op.f("ix_athlete_sessions_member_id"),
        "athlete_sessions",
        ["member_id"],
        unique=False,
    )

    op.create_table(
        "athlete_notifications",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("member_id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("entity_type", sa.String(length=64), nullable=True),
        sa.Column("entity_id", sa.String(length=64), nullable=True),
        sa.Column(
            "is_read",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["member_id"], ["members.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_athlete_notifications_member_id"),
        "athlete_notifications",
        ["member_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_athlete_notifications_kind"),
        "athlete_notifications",
        ["kind"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_athlete_notifications_kind"),
        table_name="athlete_notifications",
    )
    op.drop_index(
        op.f("ix_athlete_notifications_member_id"),
        table_name="athlete_notifications",
    )
    op.drop_table("athlete_notifications")
    op.drop_index(op.f("ix_athlete_sessions_member_id"), table_name="athlete_sessions")
    op.drop_index(op.f("ix_athlete_sessions_token_hash"), table_name="athlete_sessions")
    op.drop_table("athlete_sessions")
    op.drop_column("members", "password_hash")
