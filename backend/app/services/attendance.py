"""Check-in / check-out rules for GYM CONTROL (Asia/Tehran calendar day)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.attendance import Attendance
from app.models.enums import AttendanceType, MemberStatus, MembershipStatus
from app.models.gym_settings import GymSettings
from app.models.member import Member
from app.models.membership import Membership, MembershipPlan
from app.models.payment import Payment
from app.models.user import User
from app.services.debt import member_debt
from app.services.members import trainer_can_view_member

TEHRAN = ZoneInfo("Asia/Tehran")

_VALID_MEMBERSHIP_STATUSES = {MembershipStatus.ACTIVE.value}


class AttendanceError(Exception):
    def __init__(self, status_code: int, detail: str, *, code: str | None = None) -> None:
        self.status_code = status_code
        self.detail = detail
        self.code = code
        super().__init__(detail)


@dataclass
class CheckInResult:
    attendance: Attendance
    debt_toman: int
    debt_warning: str | None
    auto_closed_ids: list[int]
    sessions_remaining: int | None


def now_tehran() -> datetime:
    return datetime.now(tz=TEHRAN)


def today_tehran() -> date:
    return now_tehran().date()


def get_day_end_time(db: Session) -> time:
    settings = db.scalar(select(GymSettings).limit(1))
    if settings is None:
        return time(23, 0)
    return settings.day_end_time


def ensure_staff_may_touch_member(db: Session, user: User, member_id: int) -> None:
    from app.models.enums import StaffRole

    if user.role in {StaffRole.MANAGER.value, StaffRole.RECEPTIONIST.value}:
        return
    if user.role == StaffRole.TRAINER.value and trainer_can_view_member(
        db, trainer=user, member_id=member_id
    ):
        return
    raise AttendanceError(403, "دسترسی مجاز نیست.")


def auto_close_stale_open_attendances(db: Session, *, now: datetime | None = None) -> list[int]:
    """
    Close open attendances from a previous Tehran calendar day, or after day_end_time.
    No separate cron — called on check-in and today's list.
    """
    now = now or now_tehran()
    today = now.date()
    day_end = get_day_end_time(db)
    closed: list[int] = []

    open_rows = list(
        db.scalars(select(Attendance).where(Attendance.check_out_at.is_(None))).all()
    )
    for row in open_rows:
        check_in_local = row.check_in_at.astimezone(TEHRAN)
        check_in_day = check_in_local.date()
        should_close = False
        checkout_at: datetime | None = None

        if check_in_day < today:
            checkout_at = datetime.combine(check_in_day, day_end, tzinfo=TEHRAN)
            should_close = True
        elif check_in_day == today and now.time() >= day_end:
            # Past configured end-of-day on the same calendar day
            checkout_at = datetime.combine(today, day_end, tzinfo=TEHRAN)
            if checkout_at <= check_in_local:
                checkout_at = now
            should_close = True

        if should_close and checkout_at is not None:
            row.check_out_at = checkout_at.astimezone(timezone.utc)
            closed.append(row.id)

    if closed:
        db.flush()
    return closed


def _load_member(db: Session, member_id: int) -> Member:
    member = db.get(Member, member_id)
    if member is None:
        raise AttendanceError(404, "عضو یافت نشد.")
    if member.status == MemberStatus.ARCHIVED.value:
        raise AttendanceError(409, "عضو آرشیو شده است؛ ورود مجاز نیست.")
    return member


def _member_debt_toman(db: Session, member_id: int) -> int:
    memberships = list(
        db.scalars(select(Membership).where(Membership.member_id == member_id)).all()
    )
    payments = list(db.scalars(select(Payment).where(Payment.member_id == member_id)).all())
    return member_debt(memberships, payments).debt_toman


def _valid_memberships(db: Session, member_id: int, today: date) -> list[Membership]:
    rows = list(
        db.scalars(
            select(Membership)
            .options(joinedload(Membership.plan))
            .where(
                Membership.member_id == member_id,
                Membership.status.in_(_VALID_MEMBERSHIP_STATUSES),
                Membership.start_date <= today,
                Membership.end_date >= today,
            )
        ).unique().all()
    )
    return rows


def _plan_is_session_pack(plan: MembershipPlan) -> bool:
    return plan.session_count is not None


def select_membership_for_checkin(
    db: Session,
    *,
    member_id: int,
    attendance_type: str,
    membership_id: int | None,
    today: date,
) -> Membership:
    """
    Policy (documented in getting-started):
    - optional membership_id wins if valid for today and ACTIVE
    - gym → prefer duration plans (no session_count)
    - class / pt → prefer session packs with sessions_remaining > 0
    """
    candidates = _valid_memberships(db, member_id, today)
    if not candidates:
        raise AttendanceError(
            409,
            "اشتراک معتبر فعال برای ورود وجود ندارد (منقضی یا غیرفعال).",
            code="no_valid_membership",
        )

    if membership_id is not None:
        chosen = next((m for m in candidates if m.id == membership_id), None)
        if chosen is None:
            raise AttendanceError(409, "عضویت انتخاب‌شده برای امروز معتبر نیست.")
        return _ensure_sessions_ok(chosen, attendance_type)

    if attendance_type in {AttendanceType.PT.value, AttendanceType.CLASS.value}:
        session_packs = [
            m
            for m in candidates
            if _plan_is_session_pack(m.plan) and (m.sessions_remaining or 0) > 0
        ]
        if not session_packs:
            raise AttendanceError(
                409,
                "بستهٔ جلسه‌ای با جلسهٔ باقی‌مانده برای این نوع ورود یافت نشد.",
                code="no_sessions",
            )
        # Prefer highest sessions_remaining, then newest end_date
        session_packs.sort(key=lambda m: (m.sessions_remaining or 0, m.end_date), reverse=True)
        return session_packs[0]

    # gym: duration plans first
    duration = [m for m in candidates if not _plan_is_session_pack(m.plan)]
    if duration:
        duration.sort(key=lambda m: m.end_date, reverse=True)
        return duration[0]

    raise AttendanceError(
        409,
        "بستهٔ مدت‌دار سالن معتبر برای ورود یافت نشد.",
        code="no_gym_membership",
    )


def _ensure_sessions_ok(membership: Membership, attendance_type: str) -> Membership:
    if attendance_type in {AttendanceType.PT.value, AttendanceType.CLASS.value}:
        if not _plan_is_session_pack(membership.plan):
            raise AttendanceError(409, "این عضویت بستهٔ جلسه‌ای نیست.")
        if (membership.sessions_remaining or 0) <= 0:
            raise AttendanceError(409, "جلسه‌ای باقی نمانده است.", code="no_sessions")
    return membership


def count_checkins_today(db: Session, member_id: int, today: date) -> int:
    rows = list(
        db.scalars(select(Attendance).where(Attendance.member_id == member_id)).all()
    )
    count = 0
    for row in rows:
        if row.check_in_at.astimezone(TEHRAN).date() == today:
            count += 1
    return count


def open_attendance_for_member(db: Session, member_id: int) -> Attendance | None:
    return db.scalar(
        select(Attendance)
        .where(Attendance.member_id == member_id, Attendance.check_out_at.is_(None))
        .order_by(Attendance.check_in_at.desc())
        .limit(1)
    )


def check_in(
    db: Session,
    *,
    user: User,
    member_id: int,
    attendance_type: str,
    confirm_second_visit: bool = False,
    membership_id: int | None = None,
) -> CheckInResult:
    if attendance_type not in {
        AttendanceType.GYM.value,
        AttendanceType.CLASS.value,
        AttendanceType.PT.value,
    }:
        raise AttendanceError(422, "نوع حضور نامعتبر است.")

    ensure_staff_may_touch_member(db, user, member_id)
    auto_closed = auto_close_stale_open_attendances(db)
    member = _load_member(db, member_id)
    today = today_tehran()
    now = now_tehran()

    still_open = open_attendance_for_member(db, member.id)
    if still_open is not None:
        raise AttendanceError(
            409,
            "این عضو هنوز خروج نزده است؛ اول خروج ثبت کنید.",
            code="open_attendance",
        )

    prior_today = count_checkins_today(db, member.id, today)
    if prior_today >= 1 and not confirm_second_visit:
        raise AttendanceError(
            409,
            "ورود دوم در همین روز نیاز به تأیید منشی دارد.",
            code="second_visit_needs_confirm",
        )

    membership = select_membership_for_checkin(
        db,
        member_id=member.id,
        attendance_type=attendance_type,
        membership_id=membership_id,
        today=today,
    )

    debt = _member_debt_toman(db, member.id)
    debt_warning = None
    if debt > 0:
        debt_warning = f"این عضو بدهی دارد: {debt:,} تومان (ورود مجاز است)."

    if attendance_type in {AttendanceType.PT.value, AttendanceType.CLASS.value}:
        assert membership.sessions_remaining is not None
        membership.sessions_remaining = max(membership.sessions_remaining - 1, 0)

    attendance = Attendance(
        member_id=member.id,
        membership_id=membership.id,
        check_in_at=now.astimezone(timezone.utc),
        check_out_at=None,
        attendance_type=attendance_type,
        recorded_by_user_id=user.id,
    )
    db.add(attendance)
    db.flush()

    return CheckInResult(
        attendance=attendance,
        debt_toman=debt,
        debt_warning=debt_warning,
        auto_closed_ids=auto_closed,
        sessions_remaining=membership.sessions_remaining,
    )


def check_out(
    db: Session,
    *,
    user: User,
    attendance_id: int,
) -> Attendance:
    attendance = db.get(Attendance, attendance_id)
    if attendance is None:
        raise AttendanceError(404, "حضور یافت نشد.")
    ensure_staff_may_touch_member(db, user, attendance.member_id)
    if attendance.check_out_at is not None:
        raise AttendanceError(409, "برای این حضور قبلاً خروج ثبت شده است.")

    attendance.check_out_at = now_tehran().astimezone(timezone.utc)
    # Keep original recorded_by; checkout by current user is enough via audit later.
    # Optionally stamp who closed — no column; leave as-is for v1.
    db.flush()
    return attendance


def list_today_attendances(
    db: Session,
    *,
    user: User,
    member_id: int | None = None,
) -> tuple[list[Attendance], list[int]]:
    from app.models.enums import StaffRole
    from app.services.members import active_trainee_member_ids

    auto_closed = auto_close_stale_open_attendances(db)
    today = today_tehran()
    rows = list(db.scalars(select(Attendance).order_by(Attendance.check_in_at.desc())).all())
    filtered: list[Attendance] = []
    allowed: set[int] | None = None
    if user.role == StaffRole.TRAINER.value:
        allowed = active_trainee_member_ids(db, user.id)

    for row in rows:
        if row.check_in_at.astimezone(TEHRAN).date() != today:
            continue
        if member_id is not None and row.member_id != member_id:
            continue
        if allowed is not None and row.member_id not in allowed:
            continue
        filtered.append(row)
    return filtered, auto_closed
