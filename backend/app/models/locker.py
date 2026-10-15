"""Lockers and assignments (no separate locker rent in v1)."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base

if TYPE_CHECKING:
    from app.models.member import Member
    from app.models.membership import Membership


class Locker(Base):
    __tablename__ = "lockers"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    assignments: Mapped[list[LockerAssignment]] = relationship(back_populates="locker")


class LockerAssignment(Base):
    __tablename__ = "locker_assignments"
    __table_args__ = (
        # One active assignment per locker enforced in service; history rows keep released_at set.
        UniqueConstraint("locker_id", "assigned_at", name="uq_locker_assignments_locker_time"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    locker_id: Mapped[int] = mapped_column(ForeignKey("lockers.id"), nullable=False, index=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("members.id"), nullable=False, index=True)
    membership_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("memberships.id"), nullable=True
    )
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    released_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    note: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    locker: Mapped[Locker] = relationship(back_populates="assignments")
    member: Mapped[Member] = relationship()
    membership: Mapped[Optional[Membership]] = relationship()
