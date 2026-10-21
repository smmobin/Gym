"""Locker CRUD, assign, and release. No separate locker rent in v1."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.models.enums import MemberStatus, MembershipStatus, StaffRole
from app.models.locker import Locker, LockerAssignment
from app.models.member import Member
from app.models.membership import Membership, MembershipPlan
from app.models.user import User


class LockerError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


def ensure_desk_staff(user: User) -> None:
    if user.role not in (StaffRole.MANAGER.value, StaffRole.RECEPTIONIST.value):
        raise LockerError(403, "دسترسی مجاز نیست.")


def _get_locker_or_404(db: Session, locker_id: int) -> Locker:
    row = db.get(Locker, locker_id)
    if row is None:
        raise LockerError(404, "کمد یافت نشد.")
    return row


def active_assignment_for_locker(
    db: Session, locker_id: int
) -> Optional[LockerAssignment]:
    stmt = (
        select(LockerAssignment)
        .options(joinedload(LockerAssignment.member))
        .where(
            LockerAssignment.locker_id == locker_id,
            LockerAssignment.released_at.is_(None),
        )
        .limit(1)
    )
    return db.scalar(stmt)


def active_assignment_for_member(
    db: Session, member_id: int
) -> Optional[LockerAssignment]:
    stmt = (
        select(LockerAssignment)
        .options(
            joinedload(LockerAssignment.member),
            joinedload(LockerAssignment.locker),
        )
        .where(
            LockerAssignment.member_id == member_id,
            LockerAssignment.released_at.is_(None),
        )
        .limit(1)
    )
    return db.scalar(stmt)


def assignment_out_fields(assignment: LockerAssignment) -> dict:
    member = assignment.member
    name = None
    display_id = None
    if member is not None:
        display_id = member.display_id
        name = f"{member.first_name} {member.last_name}".strip()
    return {
        "id": assignment.id,
        "member_id": assignment.member_id,
        "member_display_id": display_id,
        "member_name": name,
        "membership_id": assignment.membership_id,
        "assigned_at": assignment.assigned_at,
        "released_at": assignment.released_at,
        "note": assignment.note,
    }


def locker_payload(db: Session, locker: Locker) -> dict:
    current = active_assignment_for_locker(db, locker.id)
    return {
        "id": locker.id,
        "code": locker.code,
        "is_active": locker.is_active,
        "is_free": current is None,
        "current_assignment": assignment_out_fields(current) if current else None,
    }


def list_lockers(db: Session, *, user: User) -> list[dict]:
    ensure_desk_staff(user)
    rows = list(db.scalars(select(Locker).order_by(Locker.code.asc())).all())
    return [locker_payload(db, row) for row in rows]


def create_locker(
    db: Session,
    *,
    user: User,
    code: str,
    is_active: bool = True,
) -> dict:
    ensure_desk_staff(user)
    existing = db.scalar(select(Locker).where(Locker.code == code))
    if existing is not None:
        raise LockerError(409, "کد کمد تکراری است.")

    row = Locker(code=code, is_active=is_active)
    db.add(row)
    try:
        db.flush()
    except IntegrityError as err:
        raise LockerError(409, "کد کمد تکراری است.") from err
    return locker_payload(db, row)


def update_locker(
    db: Session,
    *,
    user: User,
    locker_id: int,
    is_active: Optional[bool] = None,
    code: Optional[str] = None,
) -> dict:
    ensure_desk_staff(user)
    row = _get_locker_or_404(db, locker_id)

    if is_active is False:
        current = active_assignment_for_locker(db, row.id)
        if current is not None:
            raise LockerError(
                400,
                "کمد اشغال است؛ اول آزادسازی کنید، بعد غیرفعال کنید.",
            )
        row.is_active = False
    elif is_active is True:
        row.is_active = True

    if code is not None and code != row.code:
        clash = db.scalar(select(Locker).where(Locker.code == code, Locker.id != row.id))
        if clash is not None:
            raise LockerError(409, "کد کمد تکراری است.")
        row.code = code

    try:
        db.flush()
    except IntegrityError as err:
        raise LockerError(409, "کد کمد تکراری است.") from err
    return locker_payload(db, row)


def _locker_eligible_memberships(db: Session, member_id: int) -> list[Membership]:
    stmt = (
        select(Membership)
        .join(MembershipPlan, Membership.plan_id == MembershipPlan.id)
        .where(
            Membership.member_id == member_id,
            Membership.status == MembershipStatus.ACTIVE.value,
            MembershipPlan.includes_locker.is_(True),
        )
        .order_by(Membership.end_date.asc(), Membership.id.asc())
    )
    return list(db.scalars(stmt).all())


def list_eligible_members(db: Session, *, user: User) -> list[dict]:
    """Members who currently have an active membership on a locker-including plan."""
    ensure_desk_staff(user)
    stmt = (
        select(Member, MembershipPlan.name)
        .join(Membership, Membership.member_id == Member.id)
        .join(MembershipPlan, Membership.plan_id == MembershipPlan.id)
        .where(
            Membership.status == MembershipStatus.ACTIVE.value,
            MembershipPlan.includes_locker.is_(True),
            Member.status != MemberStatus.ARCHIVED.value,
        )
        .order_by(Member.display_id.asc(), Membership.id.asc())
    )
    seen: set[int] = set()
    out: list[dict] = []
    for member, plan_name in db.execute(stmt).all():
        if member.id in seen:
            continue
        seen.add(member.id)
        out.append(
            {
                "id": member.id,
                "display_id": member.display_id,
                "first_name": member.first_name,
                "last_name": member.last_name,
                "mobile": member.mobile,
                "plan_name": plan_name,
            }
        )
    return out


def _resolve_membership(
    db: Session,
    *,
    member_id: int,
    membership_id: Optional[int],
) -> Membership:
    eligible = _locker_eligible_memberships(db, member_id)
    if not eligible:
        raise LockerError(
            400,
            "این عضو عضویت فعال با طرح شامل‌کمد ندارد. "
            "اجارهٔ جدا برای کمد در نسخهٔ اول نیست. "
            "قدم بعد: در بخش مالی، عضویت را با طرح دارای «شامل کمد» تمدید کنید.",
        )

    if membership_id is not None:
        chosen = next((m for m in eligible if m.id == membership_id), None)
        if chosen is None:
            # Distinguish wrong id vs not eligible
            row = db.get(Membership, membership_id)
            if row is None or row.member_id != member_id:
                raise LockerError(400, "عضویت معتبر برای این عضو نیست.")
            raise LockerError(
                400,
                "این عضویت شامل کمد نیست یا فعال نیست. "
                "در نسخهٔ اول اجارهٔ جدا برای کمد وجود ندارد.",
            )
        return chosen

    if len(eligible) > 1:
        raise LockerError(
            400,
            "چند عضویت شامل‌کمد فعال وجود دارد؛ membership_id را صریح بفرستید.",
        )
    return eligible[0]


def assign_locker(
    db: Session,
    *,
    user: User,
    locker_id: int,
    member_id: int,
    membership_id: Optional[int] = None,
    note: Optional[str] = None,
) -> tuple[dict, LockerAssignment]:
    ensure_desk_staff(user)
    locker = _get_locker_or_404(db, locker_id)

    if not locker.is_active:
        raise LockerError(409, "این کمد غیرفعال است.")

    if active_assignment_for_locker(db, locker.id) is not None:
        raise LockerError(409, "این کمد الان اشغال است.")

    member = db.get(Member, member_id)
    if member is None:
        raise LockerError(404, "عضو یافت نشد.")
    if member.status == MemberStatus.ARCHIVED.value:
        raise LockerError(400, "عضو آرشیو شده قابل واگذاری کمد نیست.")

    existing_member_locker = active_assignment_for_member(db, member_id)
    if existing_member_locker is not None:
        code = (
            existing_member_locker.locker.code
            if existing_member_locker.locker is not None
            else "?"
        )
        raise LockerError(
            409,
            f"این عضو الان کمد دارد ({code}). اول همان را آزاد کنید.",
        )

    membership = _resolve_membership(
        db, member_id=member_id, membership_id=membership_id
    )

    assignment = LockerAssignment(
        locker_id=locker.id,
        member_id=member_id,
        membership_id=membership.id,
        note=note,
    )
    db.add(assignment)
    db.flush()
    # Reload member for response labels
    _ = assignment.member
    return locker_payload(db, locker), assignment


def release_locker(
    db: Session,
    *,
    user: User,
    locker_id: int,
) -> tuple[dict, LockerAssignment]:
    ensure_desk_staff(user)
    locker = _get_locker_or_404(db, locker_id)
    current = active_assignment_for_locker(db, locker.id)
    if current is None:
        raise LockerError(409, "این کمد واگذاری فعالی ندارد.")

    current.released_at = datetime.now(tz=timezone.utc)
    db.flush()
    _ = current.member
    return locker_payload(db, locker), current


def member_current_locker(db: Session, *, user: User, member_id: int) -> dict:
    ensure_desk_staff(user)
    member = db.get(Member, member_id)
    if member is None:
        raise LockerError(404, "عضو یافت نشد.")
    assignment = active_assignment_for_member(db, member_id)
    if assignment is None or assignment.locker is None:
        return {
            "member_id": member_id,
            "locker": None,
            "assignment": None,
        }
    return {
        "member_id": member_id,
        "locker": locker_payload(db, assignment.locker),
            "assignment": assignment_out_fields(assignment),
        }
