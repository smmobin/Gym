"""workout plan structured items + exercise catalog

Revision ID: g7a8b9c0d1e2
Revises: f6a7b8c9d0e1
Create Date: 2026-10-29 02:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "g7a8b9c0d1e2"
down_revision: Union[str, Sequence[str], None] = "f6a7b8c9d0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "workout_exercises",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("name_key", sa.String(length=120), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name_key", name="uq_workout_exercises_name_key"),
    )
    op.create_index(
        op.f("ix_workout_exercises_name_key"), "workout_exercises", ["name_key"], unique=False
    )
    op.create_index(
        op.f("ix_workout_exercises_created_by_user_id"),
        "workout_exercises",
        ["created_by_user_id"],
        unique=False,
    )

    op.add_column(
        "workout_plans",
        sa.Column(
            "items",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("workout_plans", "items")
    op.drop_index(op.f("ix_workout_exercises_created_by_user_id"), table_name="workout_exercises")
    op.drop_index(op.f("ix_workout_exercises_name_key"), table_name="workout_exercises")
    op.drop_table("workout_exercises")
