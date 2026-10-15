"""Simple capacity guard for group class bookings (no overbook in v1)."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.enums import BookingStatus
from app.models.group_class import ClassBooking, GroupClass


class ClassFullError(ValueError):
    """Raised when a class has no remaining capacity."""


def active_booking_count(session: Session, group_class_id: int) -> int:
    stmt = (
        select(func.count())
        .select_from(ClassBooking)
        .where(
            ClassBooking.group_class_id == group_class_id,
            ClassBooking.status == BookingStatus.BOOKED.value,
        )
    )
    return int(session.scalar(stmt) or 0)


def remaining_capacity(session: Session, group_class: GroupClass) -> int:
    return max(group_class.capacity - active_booking_count(session, group_class.id), 0)


def assert_can_book(session: Session, group_class: GroupClass) -> None:
    if remaining_capacity(session, group_class) <= 0:
        raise ClassFullError(f"Class {group_class.id} is full (capacity={group_class.capacity})")
