"""Athlete self-service: only the session member's data."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.jalali import format_datetime_fa
from app.core.security import hash_password, verify_password
from app.models.athlete_notification import AthleteNotification
from app.models.enums import MemberStatus, StaffRole
from app.models.group_class import GroupClass
from app.models.member import Member
from app.models.membership import Membership, MembershipPlan
from app.models.payment import Payment
from app.models.user import User
from app.models.workout import WorkoutPlan
from app.services.audit import write_audit
from app.services.debt import member_debt
from app.services.notifications import KIND_RENEWAL_REQUEST, create_notification

MIN_PASSWORD_LEN = 8

KIND_CLASS_BOOKED = "class_booked"


class AthleteError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


def member_eligible_for_login(member: Member) -> bool:
    """Non-archived members may use athlete auth (OTP primary; password optional)."""
    if member.status == MemberStatus.ARCHIVED.value or member.archived_at is not None:
        return False
    return True


def member_may_login(member: Member) -> bool:
    """Password path: eligible + password set (legacy athlete login)."""
    if not member_eligible_for_login(member):
        return False
    if not member.password_hash:
        return False
    return True


def authenticate_athlete(db: Session, *, mobile: str, password: str) -> Member:
    if len(password) < MIN_PASSWORD_LEN:
        raise AthleteError(400, "رمز باید حداقل ۸ کاراکتر باشد.")
    member = db.scalar(select(Member).where(Member.mobile == mobile.strip()))
    if member is None or not member_eligible_for_login(member):
        raise AthleteError(401, "موبایل یا رمز نادرست است.")
    if not member.password_hash:
        raise AthleteError(
            400,
            "رمز عبور برای این حساب ست نشده است. به میز پذیرش مراجعه کنید یا با کد پیامک وارد شوید.",
        )
    if not verify_password(password, member.password_hash):
        raise AthleteError(401, "موبایل یا رمز نادرست است.")
    return member


def set_athlete_password(
    db: Session,
    *,
    user: User,
    member_id: int,
    password: str,
) -> Member:
    if user.role not in {StaffRole.MANAGER.value, StaffRole.RECEPTIONIST.value}:
        raise AthleteError(403, "دسترسی مجاز نیست.")
    if len(password) < MIN_PASSWORD_LEN:
        raise AthleteError(400, "رمز باید حداقل ۸ کاراکتر باشد.")
    member = db.get(Member, member_id)
    if member is None:
        raise AthleteError(404, "عضو یافت نشد.")
    if member.status == MemberStatus.ARCHIVED.value:
        raise AthleteError(400, "عضو آرشیو شده رمز نمی‌گیرد.")
    member.password_hash = hash_password(password)
    write_audit(
        db,
        actor_user_id=user.id,
        action="member.athlete_password_set",
        entity_type="member",
        entity_id=member.id,
        summary=f"ست رمز ورود ورزشکار برای {member.display_id}",
        payload={"display_id": member.display_id},
    )
    db.flush()
    return member


def patch_own_profile(
    db: Session,
    *,
    member: Member,
    first_name: str | None = None,
    last_name: str | None = None,
) -> Member:
    if member.status == MemberStatus.ARCHIVED.value:
        raise AthleteError(400, "عضو آرشیو قابل ویرایش نیست.")
    if first_name is not None:
        member.first_name = first_name
    if last_name is not None:
        member.last_name = last_name
    db.flush()
    return member


def list_own_memberships(db: Session, *, member: Member) -> tuple[list[Membership], int]:
    rows = list(
        db.scalars(
            select(Membership)
            .options(joinedload(Membership.plan))
            .where(Membership.member_id == member.id)
            .order_by(Membership.end_date.desc(), Membership.id.desc())
        ).unique().all()
    )
    payments = list(
        db.scalars(select(Payment).where(Payment.member_id == member.id)).all()
    )
    debt = member_debt(rows, payments).debt_toman
    return rows, debt


def list_own_payments(db: Session, *, member: Member) -> list[Payment]:
    return list(
        db.scalars(
            select(Payment)
            .where(Payment.member_id == member.id)
            .order_by(Payment.created_at.desc(), Payment.id.desc())
        ).all()
    )


def list_own_workout_plans(db: Session, *, member: Member) -> list[WorkoutPlan]:
    return list(
        db.scalars(
            select(WorkoutPlan)
            .options(joinedload(WorkoutPlan.trainer))
            .where(WorkoutPlan.member_id == member.id)
            .order_by(WorkoutPlan.created_at.desc(), WorkoutPlan.id.desc())
        ).unique().all()
    )


def list_own_notifications(
    db: Session, *, member: Member, unread_only: bool = False
) -> tuple[list[AthleteNotification], int]:
    stmt = (
        select(AthleteNotification)
        .where(AthleteNotification.member_id == member.id)
        .order_by(AthleteNotification.created_at.desc(), AthleteNotification.id.desc())
    )
    rows = list(db.scalars(stmt).all())
    unread = sum(1 for r in rows if not r.is_read)
    if unread_only:
        rows = [r for r in rows if not r.is_read]
    return rows, unread


def mark_own_notification_read(
    db: Session, *, member: Member, notification_id: int
) -> AthleteNotification:
    row = db.get(AthleteNotification, notification_id)
    if row is None or row.member_id != member.id:
        # Same message for missing / other member — no leak
        raise AthleteError(404, "اعلان یافت نشد.")
    row.is_read = True
    db.flush()
    return row


def mark_own_notifications_read_all(db: Session, *, member: Member) -> int:
    rows = list(
        db.scalars(
            select(AthleteNotification).where(
                AthleteNotification.member_id == member.id,
                AthleteNotification.is_read.is_(False),
            )
        ).all()
    )
    for row in rows:
        row.is_read = True
    db.flush()
    return len(rows)


def notify_class_booked(
    db: Session,
    *,
    member_id: int,
    group_class: GroupClass,
    booking_id: int,
) -> AthleteNotification:
    """In-app inbox row for the booked member (desk + self-book share this)."""
    when = format_datetime_fa(group_class.starts_at)
    row = AthleteNotification(
        member_id=member_id,
        kind=KIND_CLASS_BOOKED,
        title="رزرو کلاس",
        body=f"کلاس «{group_class.title}» برای {when} رزرو شد.",
        entity_type="class_booking",
        entity_id=str(booking_id),
        is_read=False,
    )
    db.add(row)
    db.flush()
    return row


def create_renewal_request(
    db: Session, *, member: Member, note: str | None = None
) -> tuple[int, AthleteNotification]:
    name = f"{member.first_name} {member.last_name}".strip()
    body_parts = [f"{member.display_id} — {name} — {member.mobile}"]
    if note:
        body_parts.append(f"یادداشت ورزشکار: {note}")
    staff_row = create_notification(
        db,
        kind=KIND_RENEWAL_REQUEST,
        title=f"درخواست تمدید: {name}",
        body=" | ".join(body_parts),
        role_audience="desk",
        entity_type="member",
        entity_id=member.id,
        is_derived=False,
    )
    athlete_row = AthleteNotification(
        member_id=member.id,
        kind="renewal_request_sent",
        title="درخواست تمدید ثبت شد",
        body="درخواست شما برای میز ارسال شد. تمدید خودکار و درگاه آنلاین هنوز فعال نیست.",
        entity_type="staff_notification",
        entity_id=str(staff_row.id),
        is_read=False,
    )
    db.add(athlete_row)
    write_audit(
        db,
        actor_user_id=None,
        action="athlete.renewal_request",
        entity_type="member",
        entity_id=member.id,
        summary=f"درخواست تمدید از پنل ورزشکار ({member.display_id})",
        payload={"note": note, "staff_notification_id": staff_row.id},
    )
    db.flush()
    return staff_row.id, athlete_row


def plan_name_for(membership: Membership) -> str | None:
    plan: MembershipPlan | None = getattr(membership, "plan", None)
    return plan.name if plan is not None else None
