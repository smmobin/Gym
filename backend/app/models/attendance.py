"""Check-in / check-out attendance records."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.enums import AttendanceType

if TYPE_CHECKING:
    from app.models.member import Member
    from app.models.membership import Membership
    from app.models.user import User


class Attendance(Base):
    __tablename__ = "attendances"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("members.id"), nullable=False, index=True)
    membership_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("memberships.id"), nullable=True, index=True
    )
    check_in_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    check_out_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    attendance_type: Mapped[str] = mapped_column(
        String(32), nullable=False, default=AttendanceType.GYM.value
    )
    recorded_by_user_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    member: Mapped[Member] = relationship(back_populates="attendances")
    membership: Mapped[Optional[Membership]] = relationship()
    recorded_by: Mapped[Optional[User]] = relationship()
