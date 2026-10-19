"""
Membership freeze / unfreeze.

Policy (v1) — documented in getting-started:
- Cap year label uses the Gregorian calendar year of «today» in Asia/Tehran.
- Cap usage = sum of freeze_days_used across ALL memberships of the same member
  (no automatic Jan-1 reset in v1; counters live on membership rows).
- freeze for N days: started_at=today, ends_at=today+N (resume date), end_date += N.
- Early unfreeze: unused = (ends_at - today).days; subtract from freeze_days_used and end_date.
- Due freeze (today >= ends_at): auto-complete with unused=0 on list/check-in/freeze paths.
- Check-in: only ACTIVE memberships (frozen excluded).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.enums import MembershipStatus, StaffRole
from app.models.membership import Membership
from app.models.user import User
from app.services.audit import write_audit
from app.services.billing import ensure_desk_staff, today_tehran
from app.services.gym_settings import get_or_create_settings


class FreezeError(Exception):
    def __init__(self, status_code: int, detail: str, *, code: str | None = None) -> None:
        self.status_code = status_code
        self.detail = detail
        self.code = code
        super().__init__(detail)


@dataclass(frozen=True)
class FreezeCapInfo:
    cap_days: int
    used_days: int
    remaining_days: int
    cap_year: int


def cap_year_for(today: date) -> int:
    """Gregorian year of Tehran-local today (v1 annual boundary label)."""
    return today.year


def member_freeze_days_used(db: Session, member_id: int) -> int:
    rows = list(
        db.scalars(select(Membership.freeze_days_used).where(Membership.member_id == member_id)).all()
    )
    return sum(int(v or 0) for v in rows)


def freeze_cap_info(db: Session, member_id: int, *, today: date | None = None) -> FreezeCapInfo:
    today = today or today_tehran()
    settings = get_or_create_settings(db)
    cap = int(settings.freeze_annual_cap_days)
    used = member_freeze_days_used(db, member_id)
    remaining = max(0, cap - used)
    return FreezeCapInfo(
        cap_days=cap,
        used_days=used,
        remaining_days=remaining,
        cap_year=cap_year_for(today),
    )


def complete_due_freeze(db: Session, membership: Membership, *, today: date | None = None) -> bool:
    """
    If frozen and today >= freeze_ends_at, mark active and clear current freeze window.
    Full scheduled days already counted in freeze_days_used; end_date unchanged.
    Returns True if a change was made.
    """
    today = today or today_tehran()
    if membership.status != MembershipStatus.FROZEN.value:
        return False
    if membership.freeze_ends_at is None or today < membership.freeze_ends_at:
        return False

    membership.status = MembershipStatus.ACTIVE.value
    membership.freeze_started_at = None
    membership.freeze_ends_at = None
    db.flush()
    return True


def complete_due_freezes_for_member(db: Session, member_id: int, *, today: date | None = None) -> int:
    today = today or today_tehran()
    rows = list(
        db.scalars(
            select(Membership).where(
                Membership.member_id == member_id,
                Membership.status == MembershipStatus.FROZEN.value,
            )
        ).all()
    )
    changed = 0
    for row in rows:
        if complete_due_freeze(db, row, today=today):
            changed += 1
    return changed


def _resolve_days(
    *,
    days: int | None,
    freeze_ends_at: date | None,
    today: date,
) -> tuple[int, date]:
    if days is not None and freeze_ends_at is not None:
        raise FreezeError(422, "فقط یکی از days یا freeze_ends_at را بفرستید.")
    if days is None and freeze_ends_at is None:
        raise FreezeError(422, "days یا freeze_ends_at الزامی است.")

    if days is not None:
        if days < 1:
            raise FreezeError(422, "تعداد روز توقف باید حداقل ۱ باشد.")
        ends = today + timedelta(days=days)
        return days, ends

    assert freeze_ends_at is not None
    if freeze_ends_at <= today:
        raise FreezeError(422, "تاریخ پایان توقف باید بعد از امروز باشد.")
    resolved = (freeze_ends_at - today).days
    if resolved < 1:
        raise FreezeError(422, "بازهٔ توقف نامعتبر است.")
    return resolved, freeze_ends_at


def freeze_membership(
    db: Session,
    *,
    user: User,
    membership_id: int,
    days: int | None = None,
    freeze_ends_at: date | None = None,
) -> Membership:
    ensure_desk_staff(user)
    row = db.get(Membership, membership_id)
    if row is None:
        raise FreezeError(404, "عضویت یافت نشد.")

    today = today_tehran()
    complete_due_freeze(db, row, today=today)

    if row.status == MembershipStatus.FROZEN.value:
        raise FreezeError(409, "این عضویت هم‌اکنون در توقف است.", code="already_frozen")
    if row.status != MembershipStatus.ACTIVE.value:
        raise FreezeError(
            409,
            "فقط عضویت فعال قابل توقف است (منقضی/لغو‌شده مجاز نیست).",
            code="not_active",
        )
    if row.end_date < today:
        raise FreezeError(409, "عضویت منقضی قابل توقف نیست.", code="expired")

    resolved_days, ends_at = _resolve_days(days=days, freeze_ends_at=freeze_ends_at, today=today)
    cap = freeze_cap_info(db, row.member_id, today=today)
    if resolved_days > cap.remaining_days:
        raise FreezeError(
            409,
            (
                f"سقف توقف سال {cap.cap_year} پر است یا کافی نیست "
                f"(باقی‌مانده {cap.remaining_days} از {cap.cap_days} روز)."
            ),
            code="freeze_cap_exceeded",
        )

    previous_end = row.end_date
    row.status = MembershipStatus.FROZEN.value
    row.freeze_started_at = today
    row.freeze_ends_at = ends_at
    row.freeze_days_used = int(row.freeze_days_used or 0) + resolved_days
    row.end_date = row.end_date + timedelta(days=resolved_days)
    db.flush()

    write_audit(
        db,
        actor_user_id=user.id,
        action="membership.freeze",
        entity_type="membership",
        entity_id=row.id,
        summary=f"توقف عضویت #{row.id} به مدت {resolved_days} روز",
        payload={
            "member_id": row.member_id,
            "days": resolved_days,
            "freeze_started_at": today.isoformat(),
            "freeze_ends_at": ends_at.isoformat(),
            "end_date_before": previous_end.isoformat(),
            "end_date_after": row.end_date.isoformat(),
            "freeze_days_used": row.freeze_days_used,
            "cap_year": cap.cap_year,
            "cap_days": cap.cap_days,
        },
    )
    return row


def unfreeze_membership(
    db: Session,
    *,
    user: User,
    membership_id: int,
) -> Membership:
    """
    Early unfreeze: unused scheduled days are returned to the cap counter and
    subtracted from end_date so unused pause does not inflate validity.
    On/after ends_at: same as auto-complete (unused=0).
    """
    ensure_desk_staff(user)
    row = db.get(Membership, membership_id)
    if row is None:
        raise FreezeError(404, "عضویت یافت نشد.")

    today = today_tehran()
    if complete_due_freeze(db, row, today=today):
        write_audit(
            db,
            actor_user_id=user.id,
            action="membership.unfreeze",
            entity_type="membership",
            entity_id=row.id,
            summary=f"پایان توقف عضویت #{row.id} (موعد رسیده)",
            payload={
                "member_id": row.member_id,
                "early": False,
                "unused_days": 0,
            },
        )
        return row

    if row.status != MembershipStatus.FROZEN.value:
        raise FreezeError(409, "این عضویت در حالت توقف نیست.", code="not_frozen")
    if row.freeze_ends_at is None or row.freeze_started_at is None:
        raise FreezeError(409, "بازهٔ توقف ناقص است.", code="incomplete_freeze")

    unused = max(0, (row.freeze_ends_at - today).days)
    previous_end = row.end_date
    previous_used = int(row.freeze_days_used or 0)

    if unused > 0:
        row.freeze_days_used = max(0, previous_used - unused)
        row.end_date = row.end_date - timedelta(days=unused)

    row.status = MembershipStatus.ACTIVE.value
    row.freeze_started_at = None
    row.freeze_ends_at = None
    db.flush()

    write_audit(
        db,
        actor_user_id=user.id,
        action="membership.unfreeze",
        entity_type="membership",
        entity_id=row.id,
        summary=f"پایان زودهنگام توقف عضویت #{row.id} (unused={unused})",
        payload={
            "member_id": row.member_id,
            "early": unused > 0,
            "unused_days": unused,
            "end_date_before": previous_end.isoformat(),
            "end_date_after": row.end_date.isoformat(),
            "freeze_days_used_before": previous_used,
            "freeze_days_used_after": row.freeze_days_used,
        },
    )
    return row


def load_membership_with_plan(db: Session, membership_id: int) -> Membership:
    row = db.scalar(
        select(Membership)
        .options(joinedload(Membership.plan))
        .where(Membership.id == membership_id)
    )
    if row is None:
        raise FreezeError(404, "عضویت یافت نشد.")
    return row


def assert_desk_or_raise(user: User) -> None:
    if user.role not in {StaffRole.MANAGER.value, StaffRole.RECEPTIONIST.value}:
        raise FreezeError(403, "دسترسی مجاز نیست.")
