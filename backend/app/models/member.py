"""Members: soft-archive only; unique mobile; display id M-1001+."""

from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import CheckConstraint, Date, DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.enums import MemberStatus

if TYPE_CHECKING:
    from app.models.attendance import Attendance
    from app.models.membership import Membership
    from app.models.payment import Payment


class Member(Base):
    __tablename__ = "members"
    __table_args__ = (
        CheckConstraint("char_length(mobile) >= 10", name="ck_members_mobile_len"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    display_id: Mapped[str] = mapped_column(String(16), unique=True, nullable=False, index=True)
    first_name: Mapped[str] = mapped_column(String(80), nullable=False)
    last_name: Mapped[str] = mapped_column(String(80), nullable=False)
    mobile: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)
    # Backup athlete login password; null until desk sets it (primary path is OTP).
    password_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    birth_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default=MemberStatus.PENDING.value, index=True
    )
    archived_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), onupdate=func.now(), nullable=True
    )

    memberships: Mapped[list[Membership]] = relationship(back_populates="member")
    payments: Mapped[list[Payment]] = relationship(back_populates="member")
    attendances: Mapped[list[Attendance]] = relationship(back_populates="member")
