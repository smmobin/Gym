"""add_payment_gateway_fields

Revision ID: e5f6a7b8c9d0
Revises: c3d4e5f6a7b8
Create Date: 2026-10-21 01:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, Sequence[str], None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("payments", sa.Column("gateway_provider", sa.String(length=32), nullable=True))
    op.add_column("payments", sa.Column("gateway_authority", sa.String(length=64), nullable=True))
    op.add_column("payments", sa.Column("gateway_ref_id", sa.String(length=64), nullable=True))
    op.add_column("payments", sa.Column("purpose", sa.String(length=32), nullable=True))
    op.add_column("payments", sa.Column("renew_plan_id", sa.Integer(), nullable=True))
    op.add_column(
        "payments", sa.Column("renew_base_membership_id", sa.Integer(), nullable=True)
    )
    op.add_column("payments", sa.Column("renewed_membership_id", sa.Integer(), nullable=True))
    op.create_index(
        op.f("ix_payments_gateway_authority"),
        "payments",
        ["gateway_authority"],
        unique=True,
    )
    op.create_foreign_key(
        "fk_payments_renew_plan_id",
        "payments",
        "membership_plans",
        ["renew_plan_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_payments_renew_base_membership_id",
        "payments",
        "memberships",
        ["renew_base_membership_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_payments_renewed_membership_id",
        "payments",
        "memberships",
        ["renewed_membership_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_payments_renewed_membership_id", "payments", type_="foreignkey")
    op.drop_constraint("fk_payments_renew_base_membership_id", "payments", type_="foreignkey")
    op.drop_constraint("fk_payments_renew_plan_id", "payments", type_="foreignkey")
    op.drop_index(op.f("ix_payments_gateway_authority"), table_name="payments")
    op.drop_column("payments", "renewed_membership_id")
    op.drop_column("payments", "renew_base_membership_id")
    op.drop_column("payments", "renew_plan_id")
    op.drop_column("payments", "purpose")
    op.drop_column("payments", "gateway_ref_id")
    op.drop_column("payments", "gateway_authority")
    op.drop_column("payments", "gateway_provider")
