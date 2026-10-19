"""Group class CRUD, booking, and trainer schedule conflict warning."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import and_, select
from sqlalchemy.orm import Session, joinedload

from app.models.enums import BookingStatus, MemberStatus, StaffRole
from app.models.group_class import ClassBooking, GroupClass
from app.models.member import Member
from app.models.user import User
from app.services.class_booking import (
    ClassFullError,
    active_booking_count,
    assert_can_book,
    remaining_capacity,
)


class GroupClassError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


@dataclass
class ClassSnapshot:
    group_class: GroupClass
    booked_count: int
    remaining: int
    trainer_schedule_conflict: bool = False


@dataclass
class BookingSnapshot:
    booking: ClassBooking
    booked_count: int
    remaining: int


def ensure_desk_staff(user: User) -> None:
    if user.role not in (StaffRole.MANAGER.value, StaffRole.RECEPTIONIST.value):
        raise GroupClassError(403, "دسترسی مجاز نیست.")


def ensure_can_mutate_booking(user: User) -> None:
    ensure_desk_staff(user)


def _overlap_filter(
    starts_at: datetime,
    ends_at: datetime,
    *,
    trainer_user_id: int,
    exclude_id: Optional[int] = None,
):
    """Two intervals overlap when A.starts < B.ends AND A.ends > B.starts."""
    clauses = [
        GroupClass.trainer_user_id == trainer_user_id,
        GroupClass.is_active.is_(True),
        GroupClass.starts_at < ends_at,
        GroupClass.ends_at > starts_at,
    ]
    if exclude_id is not None:
        clauses.append(GroupClass.id != exclude_id)
    return and_(*clauses)


def has_trainer_schedule_conflict(
    db: Session,
    *,
    trainer_user_id: Optional[int],
    starts_at: datetime,
    ends_at: datetime,
    exclude_id: Optional[int] = None,
) -> bool:
    if trainer_user_id is None:
        return False
    stmt = (
        select(GroupClass.id)
        .where(
            _overlap_filter(
                starts_at,
                ends_at,
                trainer_user_id=trainer_user_id,
                exclude_id=exclude_id,
            )
        )
        .limit(1)
    )
    return db.scalar(stmt) is not None


def validate_time_range(starts_at: datetime, ends_at: datetime) -> None:
    if ends_at <= starts_at:
        raise GroupClassError(422, "زمان پایان باید بعد از زمان شروع باشد.")


def _get_class_or_404(db: Session, class_id: int) -> GroupClass:
    row = db.get(GroupClass, class_id)
    if row is None:
        raise GroupClassError(404, "کلاس یافت نشد.")
    return row


def _trainer_may_view(user: User, group_class: GroupClass) -> bool:
    if user.role != StaffRole.TRAINER.value:
        return True
    return group_class.trainer_user_id == user.id


def ensure_can_view_class(user: User, group_class: GroupClass) -> None:
    if not _trainer_may_view(user, group_class):
        raise GroupClassError(403, "دسترسی مجاز نیست.")


def snapshot(db: Session, group_class: GroupClass, *, conflict: bool = False) -> ClassSnapshot:
    booked = active_booking_count(db, group_class.id)
    return ClassSnapshot(
        group_class=group_class,
        booked_count=booked,
        remaining=max(group_class.capacity - booked, 0),
        trainer_schedule_conflict=conflict,
    )


def list_group_classes(
    db: Session,
    *,
    user: User,
    starts_from: Optional[datetime] = None,
    starts_to: Optional[datetime] = None,
    upcoming: bool = False,
    include_inactive: bool = False,
) -> list[ClassSnapshot]:
    stmt = select(GroupClass)
    if not include_inactive:
        stmt = stmt.where(GroupClass.is_active.is_(True))

    if user.role == StaffRole.TRAINER.value:
        stmt = stmt.where(GroupClass.trainer_user_id == user.id)

    if upcoming:
        now = datetime.now(tz=timezone.utc)
        stmt = stmt.where(GroupClass.starts_at >= now)
    if starts_from is not None:
        stmt = stmt.where(GroupClass.starts_at >= starts_from)
    if starts_to is not None:
        stmt = stmt.where(GroupClass.starts_at <= starts_to)

    stmt = stmt.order_by(GroupClass.starts_at.asc())
    rows = list(db.scalars(stmt).all())
    return [snapshot(db, row) for row in rows]


def create_group_class(
    db: Session,
    *,
    user: User,
    title: str,
    capacity: int,
    gender_label: str,
    starts_at: datetime,
    ends_at: datetime,
    trainer_user_id: Optional[int],
) -> ClassSnapshot:
    ensure_desk_staff(user)
    validate_time_range(starts_at, ends_at)
    if capacity <= 0:
        raise GroupClassError(422, "ظرفیت باید بزرگ‌تر از صفر باشد.")

    if trainer_user_id is not None:
        trainer = db.get(User, trainer_user_id)
        if trainer is None or trainer.role != StaffRole.TRAINER.value or not trainer.is_active:
            raise GroupClassError(400, "مربی معتبر نیست.")

    conflict = has_trainer_schedule_conflict(
        db,
        trainer_user_id=trainer_user_id,
        starts_at=starts_at,
        ends_at=ends_at,
    )

    row = GroupClass(
        title=title,
        capacity=capacity,
        gender_label=gender_label,
        starts_at=starts_at,
        ends_at=ends_at,
        trainer_user_id=trainer_user_id,
        is_active=True,
    )
    db.add(row)
    db.flush()
    return snapshot(db, row, conflict=conflict)


def update_group_class(
    db: Session,
    *,
    user: User,
    class_id: int,
    title: Optional[str] = None,
    capacity: Optional[int] = None,
    gender_label: Optional[str] = None,
    starts_at: Optional[datetime] = None,
    ends_at: Optional[datetime] = None,
    trainer_user_id: Optional[int] = None,
    clear_trainer: bool = False,
    is_active: Optional[bool] = None,
) -> ClassSnapshot:
    ensure_desk_staff(user)
    row = _get_class_or_404(db, class_id)

    new_starts = starts_at if starts_at is not None else row.starts_at
    new_ends = ends_at if ends_at is not None else row.ends_at
    validate_time_range(new_starts, new_ends)

    if capacity is not None:
        booked = active_booking_count(db, row.id)
        if capacity < booked:
            raise GroupClassError(
                400,
                f"ظرفیت نمی‌تواند کمتر از تعداد رزرو فعال ({booked}) باشد.",
            )
        row.capacity = capacity

    if title is not None:
        row.title = title
    if gender_label is not None:
        row.gender_label = gender_label
    if starts_at is not None:
        row.starts_at = starts_at
    if ends_at is not None:
        row.ends_at = ends_at
    if is_active is not None:
        row.is_active = is_active

    new_trainer_id = row.trainer_user_id
    if clear_trainer:
        new_trainer_id = None
        row.trainer_user_id = None
    elif trainer_user_id is not None:
        trainer = db.get(User, trainer_user_id)
        if trainer is None or trainer.role != StaffRole.TRAINER.value or not trainer.is_active:
            raise GroupClassError(400, "مربی معتبر نیست.")
        new_trainer_id = trainer_user_id
        row.trainer_user_id = trainer_user_id

    conflict = has_trainer_schedule_conflict(
        db,
        trainer_user_id=new_trainer_id,
        starts_at=row.starts_at,
        ends_at=row.ends_at,
        exclude_id=row.id,
    )
    db.flush()
    return snapshot(db, row, conflict=conflict)


def list_bookings(
    db: Session,
    *,
    user: User,
    class_id: int,
) -> tuple[list[ClassBooking], ClassSnapshot]:
    group_class = _get_class_or_404(db, class_id)
    ensure_can_view_class(user, group_class)
    stmt = (
        select(ClassBooking)
        .options(joinedload(ClassBooking.member))
        .where(ClassBooking.group_class_id == class_id)
        .order_by(ClassBooking.created_at.asc())
    )
    rows = list(db.scalars(stmt).unique().all())
    return rows, snapshot(db, group_class)


def book_member(
    db: Session,
    *,
    user: User,
    class_id: int,
    member_id: int,
) -> BookingSnapshot:
    ensure_can_mutate_booking(user)
    group_class = _get_class_or_404(db, class_id)
    if not group_class.is_active:
        raise GroupClassError(400, "این کلاس فعال نیست.")

    member = db.get(Member, member_id)
    if member is None:
        raise GroupClassError(404, "عضو یافت نشد.")
    if member.status == MemberStatus.ARCHIVED.value:
        raise GroupClassError(400, "عضو آرشیو شده قابل رزرو نیست.")

    existing = db.scalar(
        select(ClassBooking).where(
            ClassBooking.group_class_id == class_id,
            ClassBooking.member_id == member_id,
        )
    )
    if existing is not None and existing.status == BookingStatus.BOOKED.value:
        raise GroupClassError(409, "این عضو قبلاً برای این کلاس رزرو شده است.")

    try:
        assert_can_book(db, group_class)
    except ClassFullError as err:
        raise GroupClassError(409, "ظرفیت کلاس تکمیل است.") from err

    if existing is not None:
        # Re-activate after cancel (UniqueConstraint on class+member).
        existing.status = BookingStatus.BOOKED.value
        existing.cancelled_at = None
        booking = existing
    else:
        booking = ClassBooking(
            group_class_id=class_id,
            member_id=member_id,
            status=BookingStatus.BOOKED.value,
        )
        db.add(booking)

    db.flush()
    snap = snapshot(db, group_class)
    return BookingSnapshot(
        booking=booking,
        booked_count=snap.booked_count,
        remaining=snap.remaining,
    )


def cancel_booking(
    db: Session,
    *,
    user: User,
    class_id: int,
    booking_id: int,
) -> BookingSnapshot:
    ensure_can_mutate_booking(user)
    group_class = _get_class_or_404(db, class_id)
    booking = db.get(ClassBooking, booking_id)
    if booking is None or booking.group_class_id != class_id:
        raise GroupClassError(404, "رزرو یافت نشد.")

    if booking.status == BookingStatus.CANCELLED.value:
        raise GroupClassError(409, "این رزرو قبلاً لغو شده است.")

    booking.status = BookingStatus.CANCELLED.value
    booking.cancelled_at = datetime.now(tz=timezone.utc)
    db.flush()
    snap = snapshot(db, group_class)
    return BookingSnapshot(
        booking=booking,
        booked_count=snap.booked_count,
        remaining=snap.remaining,
    )
