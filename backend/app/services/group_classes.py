"""Group class CRUD, booking, and trainer schedule conflict warning."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Optional, Union

from sqlalchemy import and_, select
from sqlalchemy.orm import Session, joinedload

from app.models.attendance import Attendance
from app.models.enums import (
    AttendanceType,
    BookingStatus,
    MemberStatus,
    MembershipStatus,
    StaffRole,
)
from app.models.group_class import ClassBooking, GroupClass
from app.models.member import Member
from app.models.membership import Membership
from app.models.user import User
from app.services.attendance import today_tehran
from app.services.class_booking import (
    ClassFullError,
    active_booking_count,
    assert_can_book,
    remaining_capacity,
)


class GroupClassError(Exception):
    def __init__(self, status_code: int, detail: Union[str, dict[str, Any]]) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(str(detail))


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


@dataclass
class AttendanceOutcomeSnapshot:
    booking: ClassBooking
    booked_count: int
    remaining: int
    session_deducted: bool
    sessions_remaining: Optional[int]
    membership_id: Optional[int]
    already_deducted_via_attendance: bool


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


def book_member_core(
    db: Session,
    *,
    class_id: int,
    member_id: int,
) -> BookingSnapshot:
    """Capacity + duplicate rules shared by desk and athlete self-booking."""
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


def cancel_booking_core(
    db: Session,
    *,
    class_id: int,
    booking_id: int,
) -> BookingSnapshot:
    """Cancel a booked row; caller must enforce who may cancel."""
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


def book_member(
    db: Session,
    *,
    user: User,
    class_id: int,
    member_id: int,
) -> BookingSnapshot:
    ensure_can_mutate_booking(user)
    return book_member_core(db, class_id=class_id, member_id=member_id)


def cancel_booking(
    db: Session,
    *,
    user: User,
    class_id: int,
    booking_id: int,
) -> BookingSnapshot:
    ensure_can_mutate_booking(user)
    return cancel_booking_core(db, class_id=class_id, booking_id=booking_id)


def _ensure_class_started(group_class: GroupClass) -> None:
    """Policy: no-show / attended only after class starts_at (UTC-aware compare)."""
    now = datetime.now(tz=timezone.utc)
    starts = group_class.starts_at
    if starts.tzinfo is None:
        starts = starts.replace(tzinfo=timezone.utc)
    if now < starts:
        raise GroupClassError(
            400,
            "ثبت حاضر/غایب فقط بعد از شروع کلاس مجاز است.",
        )


def _class_related_attendance(
    db: Session, *, member_id: int, group_class: GroupClass
) -> Optional[Attendance]:
    """
    Detect prior class check-in that already consumed a session for this slot.
    Window: 2h before starts_at through 2h after ends_at.
    """
    starts = group_class.starts_at
    ends = group_class.ends_at
    if starts.tzinfo is None:
        starts = starts.replace(tzinfo=timezone.utc)
    if ends.tzinfo is None:
        ends = ends.replace(tzinfo=timezone.utc)
    window_start = starts - timedelta(hours=2)
    window_end = ends + timedelta(hours=2)
    stmt = (
        select(Attendance)
        .where(
            Attendance.member_id == member_id,
            Attendance.attendance_type == AttendanceType.CLASS.value,
            Attendance.check_in_at >= window_start,
            Attendance.check_in_at <= window_end,
        )
        .order_by(Attendance.check_in_at.desc())
        .limit(1)
    )
    return db.scalar(stmt)


def _session_pack_options(db: Session, member_id: int) -> list[Membership]:
    today = today_tehran()
    rows = list(
        db.scalars(
            select(Membership)
            .options(joinedload(Membership.plan))
            .where(
                Membership.member_id == member_id,
                Membership.status == MembershipStatus.ACTIVE.value,
                Membership.start_date <= today,
                Membership.end_date >= today,
            )
        )
        .unique()
        .all()
    )
    return [
        m
        for m in rows
        if m.plan is not None
        and m.plan.session_count is not None
        and (m.sessions_remaining or 0) > 0
    ]


def _membership_option_payload(membership: Membership) -> dict[str, Any]:
    plan_name = membership.plan.name if membership.plan is not None else None
    return {
        "id": membership.id,
        "plan_name": plan_name,
        "sessions_remaining": membership.sessions_remaining,
        "start_date": membership.start_date.isoformat(),
        "end_date": membership.end_date.isoformat(),
    }


def _resolve_class_membership(
    db: Session,
    *,
    member_id: int,
    membership_id: Optional[int],
) -> Membership:
    options = _session_pack_options(db, member_id)

    if membership_id is not None:
        row = db.scalar(
            select(Membership)
            .options(joinedload(Membership.plan))
            .where(Membership.id == membership_id)
        )
        if row is None or row.member_id != member_id:
            raise GroupClassError(400, "عضویت انتخاب‌شده برای این عضو معتبر نیست.")
        if row.status != MembershipStatus.ACTIVE.value:
            raise GroupClassError(400, "عضویت انتخاب‌شده فعال نیست.")
        today = today_tehran()
        if row.start_date > today or row.end_date < today:
            raise GroupClassError(400, "عضویت انتخاب‌شده برای امروز معتبر نیست.")
        if row.plan is None or row.plan.session_count is None:
            raise GroupClassError(
                400,
                "عضویت انتخاب‌شده بستهٔ جلسه‌ای نیست؛ با هشدار فقط بستهٔ جلسه را انتخاب کنید.",
            )
        return row

    if len(options) == 1:
        return options[0]

    if len(options) == 0:
        raise GroupClassError(
            400,
            {
                "code": "membership_required",
                "message": (
                    "بستهٔ جلسه‌ای با جلسهٔ باقی‌مانده یافت نشد. "
                    "اگر عضو بسته دارد، membership_id را صریحاً بفرستید."
                ),
                "options": [],
            },
        )

    raise GroupClassError(
        400,
        {
            "code": "membership_required",
            "message": (
                "چند بستهٔ جلسه‌ای فعال است؛ membership_id را با هشدار انتخاب کنید."
            ),
            "options": [_membership_option_payload(m) for m in options],
        },
    )


def _apply_attendance_outcome(
    db: Session,
    *,
    user: User,
    class_id: int,
    booking_id: int,
    new_status: str,
    membership_id: Optional[int],
) -> AttendanceOutcomeSnapshot:
    ensure_can_mutate_booking(user)
    group_class = _get_class_or_404(db, class_id)
    _ensure_class_started(group_class)

    booking = db.get(ClassBooking, booking_id)
    if booking is None or booking.group_class_id != class_id:
        raise GroupClassError(404, "رزرو یافت نشد.")

    if booking.status != BookingStatus.BOOKED.value:
        raise GroupClassError(
            409,
            "فقط رزرو با وضعیت booked قابل ثبت حاضر/غایب است.",
        )

    prior = _class_related_attendance(db, member_id=booking.member_id, group_class=group_class)
    already = prior is not None
    session_deducted = False
    sessions_remaining: Optional[int] = None
    used_membership_id: Optional[int] = prior.membership_id if prior is not None else None

    if already:
        if prior is not None and prior.membership_id is not None:
            membership = db.get(Membership, prior.membership_id)
            if membership is not None:
                sessions_remaining = membership.sessions_remaining
                used_membership_id = membership.id
    else:
        membership = _resolve_class_membership(
            db, member_id=booking.member_id, membership_id=membership_id
        )
        assert membership.sessions_remaining is not None
        membership.sessions_remaining = max(membership.sessions_remaining - 1, 0)
        session_deducted = True
        sessions_remaining = membership.sessions_remaining
        used_membership_id = membership.id

    booking.status = new_status
    db.flush()
    snap = snapshot(db, group_class)
    return AttendanceOutcomeSnapshot(
        booking=booking,
        booked_count=snap.booked_count,
        remaining=snap.remaining,
        session_deducted=session_deducted,
        sessions_remaining=sessions_remaining,
        membership_id=used_membership_id,
        already_deducted_via_attendance=already,
    )


def mark_no_show(
    db: Session,
    *,
    user: User,
    class_id: int,
    booking_id: int,
    membership_id: Optional[int] = None,
) -> AttendanceOutcomeSnapshot:
    return _apply_attendance_outcome(
        db,
        user=user,
        class_id=class_id,
        booking_id=booking_id,
        new_status=BookingStatus.NO_SHOW.value,
        membership_id=membership_id,
    )


def mark_attended(
    db: Session,
    *,
    user: User,
    class_id: int,
    booking_id: int,
    membership_id: Optional[int] = None,
) -> AttendanceOutcomeSnapshot:
    """
    Same session policy as no-show: deduct one class session unless a class
    check-in in the class time window already consumed a session.
    """
    return _apply_attendance_outcome(
        db,
        user=user,
        class_id=class_id,
        booking_id=booking_id,
        new_status=BookingStatus.ATTENDED.value,
        membership_id=membership_id,
    )
