"""audit_logs.request_id + system_error_events (manager activity)

Revision ID: k1e2f3a4b5c6
Revises: j0d1e2f3a4b5
Create Date: 2026-11-10 21:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "k1e2f3a4b5c6"
down_revision: Union[str, Sequence[str], None] = "j0d1e2f3a4b5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "audit_logs",
        sa.Column("request_id", sa.String(length=64), nullable=True),
    )
    op.create_index("ix_audit_logs_request_id", "audit_logs", ["request_id"])
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])

    op.create_table(
        "system_error_events",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("request_id", sa.String(length=64), nullable=True),
        sa.Column("method", sa.String(length=10), nullable=False),
        sa.Column("path", sa.String(length=255), nullable=False),
        sa.Column("status_code", sa.Integer(), nullable=False),
        sa.Column("error_type", sa.String(length=80), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_system_error_events_request_id", "system_error_events", ["request_id"]
    )
    op.create_index(
        "ix_system_error_events_status_code", "system_error_events", ["status_code"]
    )
    op.create_index(
        "ix_system_error_events_created_at", "system_error_events", ["created_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_system_error_events_created_at", table_name="system_error_events")
    op.drop_index("ix_system_error_events_status_code", table_name="system_error_events")
    op.drop_index("ix_system_error_events_request_id", table_name="system_error_events")
    op.drop_table("system_error_events")
    op.drop_index("ix_audit_logs_created_at", table_name="audit_logs")
    op.drop_index("ix_audit_logs_request_id", table_name="audit_logs")
    op.drop_column("audit_logs", "request_id")
