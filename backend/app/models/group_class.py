"""Group classes and bookings. Capacity enforced via helper (no overbook in v1)."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.enums import BookingStatus, GenderLabel

if TYPE_CHECKING:
    from app.models.member import Member
    from app.models.user import User


class GroupClass(Base):
    __tablename__ = "group_classes"
    __table_args__ = (
        CheckConstraint("capacity > 0", name="ck_group_classes_capacity_positive"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    trainer_user_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id"), nullable=True, index=True
    )
    capacity: Mapped[int] = mapped_column(Integer, nullable=False)
    gender_label: Mapped[str] = mapped_column(
        String(16), nullable=False, default=GenderLabel.MIXED.value
    )
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    trainer: Mapped[Optional[User]] = relationship()
    bookings: Mapped[list[ClassBooking]] = relationship(back_populates="group_class")


class ClassBooking(Base):
    __tablename__ = "class_bookings"
    __table_args__ = (
        UniqueConstraint("group_class_id", "member_id", name="uq_class_bookings_class_member"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    group_class_id: Mapped[int] = mapped_column(
        ForeignKey("group_classes.id"), nullable=False, index=True
    )
    member_id: Mapped[int] = mapped_column(ForeignKey("members.id"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default=BookingStatus.BOOKED.value, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    cancelled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    group_class: Mapped[GroupClass] = relationship(back_populates="bookings")
    member: Mapped[Member] = relationship()
