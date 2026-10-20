"""Desk (receptionist) dashboard summary — operational, not manager P&L."""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.enums import MemberStatus, MembershipStatus, StaffRole, TrialLeadStatus
from app.models.member import Member
from app.models.membership import Membership
from app.models.notification import StaffNotification
from app.models.payment import Payment
from app.models.trial_lead import TrialLead
from app.models.user import User
from app.services.attendance import list_today_attendances, today_tehran
from app.services.debt import member_debt
from app.services.guests import GuestError, find_guest_day_plan
from app.services.gym_settings import get_or_create_settings
from app.services.notifications import KIND_RENEWAL_REQUEST

_DESK = {StaffRole.MANAGER.value, StaffRole.RECEPTIONIST.value}
_ACTIVE_MEMBERSHIP = {
    MembershipStatus.ACTIVE.value,
    MembershipStatus.FROZEN.value,
}
_OPEN_TRIAL = {TrialLeadStatus.NEW.value, TrialLeadStatus.CONTACTED.value}

_ACTION_LIMIT = 6


class DeskError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


def ensure_desk(user: User) -> None:
    if user.role not in _DESK:
        raise DeskError(403, "دسترسی مجاز نیست.")


def _guests_today_count(db: Session, today) -> int:
    try:
        plan = find_guest_day_plan(db)
    except GuestError:
        # Fallback: any 1-day plan named like guest
        plan = None
    if plan is None:
        return 0
    return int(
        db.scalar(
            select(func.count())
            .select_from(Membership)
            .where(
                Membership.plan_id == plan.id,
                Membership.start_date == today,
            )
        )
        or 0
    )


def build_desk_summary(db: Session, *, user: User) -> dict:
    ensure_desk(user)
    today = today_tehran()
    settings = get_or_create_settings(db)
    warn_until = today + timedelta(days=settings.expiry_warning_days)

    rows, _auto = list_today_attendances(db, user=user)
    open_count = sum(1 for r in rows if r.check_out_at is None)

    trial_rows = list(
        db.scalars(
            select(TrialLead)
            .where(TrialLead.status.in_(_OPEN_TRIAL))
            .order_by(TrialLead.created_at.desc(), TrialLead.id.desc())
        ).all()
    )

    # Expiring memberships
    memberships = db.scalars(
        select(Membership).where(
            Membership.status.in_(_ACTIVE_MEMBERSHIP),
            Membership.end_date.is_not(None),
            Membership.end_date >= today,
            Membership.end_date <= warn_until,
        )
    ).all()
    member_ids = {m.member_id for m in memberships}
    members_by_id: dict[int, Member] = {}
    if member_ids:
        for m in db.scalars(select(Member).where(Member.id.in_(member_ids))).all():
            members_by_id[m.id] = m

    expiring: list[dict] = []
    for ms in memberships:
        member = members_by_id.get(ms.member_id)
        if member is None or member.status == MemberStatus.ARCHIVED.value:
            continue
        name = f"{member.first_name} {member.last_name}".strip()
        end = ms.end_date.isoformat() if ms.end_date else "?"
        expiring.append(
            {
                "kind": "membership_expiring",
                "title": f"انقضای نزدیک: {name}",
                "body": f"{member.display_id} — پایان {end}",
                "href": "#billing",
                "entity_id": str(member.id),
            }
        )
        if len(expiring) >= _ACTION_LIMIT:
            break

    # Debt samples (desk ops — not income)
    active_members = list(
        db.scalars(select(Member).where(Member.status != MemberStatus.ARCHIVED.value)).all()
    )
    debtors: list[tuple[Member, int]] = []
    for member in active_members:
        ms_rows = list(
            db.scalars(select(Membership).where(Membership.member_id == member.id)).all()
        )
        pay_rows = list(
            db.scalars(select(Payment).where(Payment.member_id == member.id)).all()
        )
        debt = member_debt(ms_rows, pay_rows).debt_toman
        if debt > 0:
            debtors.append((member, debt))
    debtors.sort(key=lambda t: t[1], reverse=True)

    debt_items: list[dict] = []
    for member, debt in debtors[:_ACTION_LIMIT]:
        name = f"{member.first_name} {member.last_name}".strip()
        debt_items.append(
            {
                "kind": "member_debt",
                "title": f"بدهی: {name}",
                "body": f"{member.display_id} — {debt:,} تومان",
                "href": "#billing",
                "entity_id": str(member.id),
            }
        )

    renewals_rows = list(
        db.scalars(
            select(StaffNotification)
            .where(StaffNotification.kind == KIND_RENEWAL_REQUEST)
            .order_by(StaffNotification.created_at.desc(), StaffNotification.id.desc())
            .limit(_ACTION_LIMIT)
        ).all()
    )
    renewals = [
        {
            "kind": KIND_RENEWAL_REQUEST,
            "title": row.title,
            "body": row.body,
            "href": "#billing",
            "entity_id": row.entity_id,
        }
        for row in renewals_rows
    ]

    trial_leads = [
        {
            "kind": "trial_lead",
            "title": t.full_name,
            "body": f"{t.mobile} · {t.status}",
            "href": "#trial",
            "entity_id": str(t.id),
        }
        for t in trial_rows[:_ACTION_LIMIT]
    ]

    return {
        "today_attendance_total": len(rows),
        "today_open_count": open_count,
        "trial_open_count": len(trial_rows),
        "guests_today_count": _guests_today_count(db, today),
        "expiring": expiring,
        "debt": debt_items,
        "renewals": renewals,
        "trial_leads": trial_leads,
    }
