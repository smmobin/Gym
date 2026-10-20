"""Payments are append-only for amounts. Correction = refund + new payment (no amount edit)."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.enums import PaymentMethod, PaymentStatus

if TYPE_CHECKING:
    from app.models.member import Member
    from app.models.membership import Membership
    from app.models.user import User


class Payment(Base):
    """
    Amount is set at insert time only.
    There is no application helper to mutate `amount_toman`; status may move to refunded.
    Gateway fields store provider authority/ref for online pending → paid flow.
    """

    __tablename__ = "payments"
    __table_args__ = (
        CheckConstraint("amount_toman >= 0", name="ck_payments_amount_nonneg"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("members.id"), nullable=False, index=True)
    membership_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("memberships.id"), nullable=True, index=True
    )
    amount_toman: Mapped[int] = mapped_column(Integer, nullable=False)
    method: Mapped[str] = mapped_column(
        String(32), nullable=False, default=PaymentMethod.CASH.value
    )
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default=PaymentStatus.PAID.value, index=True
    )
    receipt_number: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    title: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by_user_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    # status_changed_at only — deliberately no updated_at for amount rewrites
    status_changed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Online gateway (nullable for cash/pos/transfer desk payments)
    gateway_provider: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    gateway_authority: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True, unique=True, index=True
    )
    gateway_ref_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    purpose: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    renew_plan_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("membership_plans.id"), nullable=True
    )
    renew_base_membership_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("memberships.id"), nullable=True
    )
    renewed_membership_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("memberships.id"), nullable=True
    )

    member: Mapped[Member] = relationship(back_populates="payments")
    membership: Mapped[Optional[Membership]] = relationship(
        foreign_keys=[membership_id],
    )
    created_by: Mapped[Optional[User]] = relationship()

    def mark_refunded(self, *, at: Optional[datetime] = None) -> None:
        """Only allowed mutation path besides insert: mark as refunded."""
        self.status = PaymentStatus.REFUNDED.value
        self.status_changed_at = at or datetime.now().astimezone()
