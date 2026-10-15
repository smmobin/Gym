"""Trainer–member assignments (many trainers per athlete allowed)."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base

if TYPE_CHECKING:
    from app.models.member import Member
    from app.models.user import User


class TrainerMemberAssignment(Base):
    __tablename__ = "trainer_member_assignments"
    __table_args__ = (
        UniqueConstraint(
            "trainer_user_id",
            "member_id",
            "assigned_at",
            name="uq_trainer_member_assigned_at",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    trainer_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("members.id"), nullable=False, index=True)
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    trainer: Mapped[User] = relationship()
    member: Mapped[Member] = relationship()
