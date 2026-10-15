"""Plans and memberships. Agreed amount is frozen per row; plan price changes do not rewrite history."""

from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.enums import MembershipStatus

if TYPE_CHECKING:
    from app.models.member import Member


class MembershipPlan(Base):
    __tablename__ = "membership_plans"
    __table_args__ = (
        CheckConstraint("base_price_toman >= 0", name="ck_plans_base_price_nonneg"),
        CheckConstraint(
            "duration_days IS NOT NULL OR session_count IS NOT NULL",
            name="ck_plans_has_duration_or_sessions",
        ),
        CheckConstraint(
            "duration_days IS NULL OR duration_days > 0",
            name="ck_plans_duration_positive",
        ),
        CheckConstraint(
            "session_count IS NULL OR session_count > 0",
            name="ck_plans_sessions_positive",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    duration_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    session_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    base_price_toman: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    includes_locker: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), onupdate=func.now(), nullable=True
    )

    memberships: Mapped[list[Membership]] = relationship(back_populates="plan")


class Membership(Base):
    """One membership row = one agreed period/package. Renewal = new row starting at prior end."""

    __tablename__ = "memberships"
    __table_args__ = (
        CheckConstraint("agreed_amount_toman >= 0", name="ck_memberships_agreed_nonneg"),
        CheckConstraint("end_date >= start_date", name="ck_memberships_date_order"),
        CheckConstraint(
            "sessions_remaining IS NULL OR sessions_remaining >= 0",
            name="ck_memberships_sessions_nonneg",
        ),
        CheckConstraint(
            "freeze_days_used >= 0",
            name="ck_memberships_freeze_used_nonneg",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("members.id"), nullable=False, index=True)
    plan_id: Mapped[int] = mapped_column(
        ForeignKey("membership_plans.id"), nullable=False, index=True
    )
    agreed_amount_toman: Mapped[int] = mapped_column(Integer, nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default=MembershipStatus.PENDING.value, index=True
    )
    sessions_remaining: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    freeze_started_at: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    freeze_ends_at: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    freeze_days_used: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), onupdate=func.now(), nullable=True
    )

    member: Mapped[Member] = relationship(back_populates="memberships")
    plan: Mapped[MembershipPlan] = relationship(back_populates="memberships")
