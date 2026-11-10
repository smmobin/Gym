"""users.also_trainer + staff_sessions.acting_role (Slice J)

Revision ID: l2f3a4b5c6d7
Revises: k1e2f3a4b5c6
Create Date: 2026-11-10 22:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "l2f3a4b5c6d7"
down_revision: Union[str, Sequence[str], None] = "k1e2f3a4b5c6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "also_trainer",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )

    op.add_column(
        "staff_sessions",
        sa.Column("acting_role", sa.String(length=32), nullable=True),
    )
    # Backfill existing sessions from the user's permanent desk/trainer role.
    op.execute(
        """
        UPDATE staff_sessions AS s
        SET acting_role = u.role
        FROM users AS u
        WHERE s.user_id = u.id
          AND s.acting_role IS NULL
        """
    )
    op.alter_column(
        "staff_sessions",
        "acting_role",
        existing_type=sa.String(length=32),
        nullable=False,
    )


def downgrade() -> None:
    op.drop_column("staff_sessions", "acting_role")
    op.drop_column("users", "also_trainer")
