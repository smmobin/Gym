"""Staff in-app notifications: event rows + light refresh on GET (no cron)."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.enums import MemberStatus, MembershipStatus, StaffRole
from app.models.member import Member
from app.models.membership import Membership
from app.models.notification import StaffNotification, StaffNotificationRead
from app.models.payment import Payment
from app.models.trial_lead import TrialLead
from app.models.user import User
from app.services.debt import member_debt
from app.services.gym_settings import get_or_create_settings

KIND_TRIAL_LEAD_NEW = "trial_lead_new"
KIND_MEMBERSHIP_EXPIRING = "membership_expiring"
KIND_MEMBER_DEBT = "member_debt"
KIND_RENEWAL_REQUEST = "renewal_request"

_DERIVED_KINDS = {KIND_MEMBERSHIP_EXPIRING, KIND_MEMBER_DEBT}

_ACTIVE_MEMBERSHIP = {
    MembershipStatus.ACTIVE.value,
    MembershipStatus.FROZEN.value,
}


class NotificationError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


def today_tehran() -> date:
    from zoneinfo import ZoneInfo

    return datetime.now(tz=ZoneInfo("Asia/Tehran")).date()


def _audience_allows(role_audience: str, user_role: str) -> bool:
    if role_audience == "all_staff":
        return user_role in {
            StaffRole.MANAGER.value,
            StaffRole.RECEPTIONIST.value,
            StaffRole.TRAINER.value,
        }
    if role_audience == "desk":
        return user_role in {StaffRole.MANAGER.value, StaffRole.RECEPTIONIST.value}
    return role_audience == user_role


def href_for(kind: str, entity_type: Optional[str], entity_id: Optional[str]) -> Optional[str]:
    if kind == KIND_TRIAL_LEAD_NEW or entity_type == "trial_lead":
        return "/trial-leads"
    if entity_type == "member" and entity_id:
        return f"/billing?member={entity_id}"
    if kind == KIND_RENEWAL_REQUEST:
        return "/billing"
    return None


def create_notification(
    db: Session,
    *,
    kind: str,
    title: str,
    body: str | None = None,
    role_audience: str = "desk",
    entity_type: str | None = None,
    entity_id: str | int | None = None,
    is_derived: bool = False,
) -> StaffNotification:
    row = StaffNotification(
        kind=kind,
        title=title,
        body=body,
        role_audience=role_audience,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id is not None else None,
        is_derived=is_derived,
    )
    db.add(row)
    db.flush()
    return row


def notify_trial_lead_created(db: Session, lead: TrialLead) -> StaffNotification:
    return create_notification(
        db,
        kind=KIND_TRIAL_LEAD_NEW,
        title="فرم آزمایشی جدید",
        body=f"{lead.full_name} — {lead.mobile}",
        role_audience="desk",
        entity_type="trial_lead",
        entity_id=lead.id,
        is_derived=False,
    )


def _upsert_derived(
    db: Session,
    *,
    kind: str,
    entity_type: str,
    entity_id: str,
    title: str,
    body: str,
    role_audience: str,
) -> StaffNotification:
    existing = db.scalar(
        select(StaffNotification)
        .where(
            StaffNotification.kind == kind,
            StaffNotification.entity_type == entity_type,
            StaffNotification.entity_id == entity_id,
            StaffNotification.is_derived.is_(True),
        )
        .limit(1)
    )
    if existing is not None:
        existing.title = title
        existing.body = body
        existing.role_audience = role_audience
        existing.updated_at = datetime.now(tz=timezone.utc)
        db.flush()
        return existing
    return create_notification(
        db,
        kind=kind,
        title=title,
        body=body,
        role_audience=role_audience,
        entity_type=entity_type,
        entity_id=entity_id,
        is_derived=True,
    )


def refresh_derived_notifications(db: Session) -> None:
    """
    Lightweight sync on GET /notifications — no cron.
    Upserts membership_expiring + member_debt; drops stale derived rows.
    """
    settings = get_or_create_settings(db)
    today = today_tehran()
    warn_until = today + timedelta(days=settings.expiry_warning_days)

    keep_keys: set[tuple[str, str, str]] = set()

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

    for ms in memberships:
        member = members_by_id.get(ms.member_id)
        if member is None or member.status == MemberStatus.ARCHIVED.value:
            continue
        name = f"{member.first_name} {member.last_name}".strip()
        end = ms.end_date.isoformat() if ms.end_date else "?"
        eid = str(member.id)
        _upsert_derived(
            db,
            kind=KIND_MEMBERSHIP_EXPIRING,
            entity_type="member",
            entity_id=eid,
            title=f"انقضای نزدیک: {name}",
            body=f"{member.display_id} — پایان اشتراک {end} (هشدار {settings.expiry_warning_days} روز)",
            role_audience="all_staff",
        )
        keep_keys.add((KIND_MEMBERSHIP_EXPIRING, "member", eid))

    # Debt: one summary + up to 10 member samples (avoid spam)
    active_members = list(
        db.scalars(
            select(Member).where(Member.status != MemberStatus.ARCHIVED.value)
        ).all()
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

    if debtors:
        total_debt = sum(d for _, d in debtors)
        summary_id = "summary"
        _upsert_derived(
            db,
            kind=KIND_MEMBER_DEBT,
            entity_type="debt",
            entity_id=summary_id,
            title=f"بدهی: {len(debtors)} عضو",
            body=f"جمع تقریبی بدهی: {total_debt:,} تومان (بدهی ≠ درآمد)",
            role_audience="desk",
        )
        keep_keys.add((KIND_MEMBER_DEBT, "debt", summary_id))
        for member, debt in debtors[:10]:
            eid = str(member.id)
            name = f"{member.first_name} {member.last_name}".strip()
            _upsert_derived(
                db,
                kind=KIND_MEMBER_DEBT,
                entity_type="member",
                entity_id=eid,
                title=f"بدهی: {name}",
                body=f"{member.display_id} — {debt:,} تومان",
                role_audience="desk",
            )
            keep_keys.add((KIND_MEMBER_DEBT, "member", eid))

    # Drop stale derived
    derived = db.scalars(
        select(StaffNotification).where(StaffNotification.is_derived.is_(True))
    ).all()
    for row in derived:
        key = (row.kind, row.entity_type or "", row.entity_id or "")
        if row.kind in _DERIVED_KINDS and key not in keep_keys:
            db.delete(row)
    db.flush()


def list_for_user(
    db: Session,
    *,
    user: User,
    unread_only: bool = False,
) -> tuple[list[dict], int]:
    refresh_derived_notifications(db)
    rows = list(
        db.scalars(
            select(StaffNotification).order_by(
                StaffNotification.created_at.desc(),
                StaffNotification.id.desc(),
            )
        ).all()
    )
    read_ids = set(
        db.scalars(
            select(StaffNotificationRead.notification_id).where(
                StaffNotificationRead.user_id == user.id
            )
        ).all()
    )

    visible: list[dict] = []
    for row in rows:
        if not _audience_allows(row.role_audience, user.role):
            continue
        is_read = row.id in read_ids
        visible.append(
            {
                "id": row.id,
                "kind": row.kind,
                "title": row.title,
                "body": row.body,
                "role_audience": row.role_audience,
                "entity_type": row.entity_type,
                "entity_id": row.entity_id,
                "is_derived": row.is_derived,
                "is_read": is_read,
                "created_at": row.created_at,
                "href": href_for(row.kind, row.entity_type, row.entity_id),
            }
        )
    unread_count = sum(1 for i in visible if not i["is_read"])
    items = [i for i in visible if not i["is_read"]] if unread_only else visible
    return items, unread_count


def mark_read(db: Session, *, user: User, notification_id: int) -> StaffNotification:
    row = db.get(StaffNotification, notification_id)
    if row is None:
        raise NotificationError(404, "اعلان یافت نشد.")
    if not _audience_allows(row.role_audience, user.role):
        raise NotificationError(403, "دسترسی مجاز نیست.")
    existing = db.scalar(
        select(StaffNotificationRead).where(
            StaffNotificationRead.notification_id == notification_id,
            StaffNotificationRead.user_id == user.id,
        )
    )
    if existing is None:
        db.add(
            StaffNotificationRead(
                notification_id=notification_id,
                user_id=user.id,
            )
        )
        db.flush()
    return row


def mark_all_read(db: Session, *, user: User) -> int:
    items, _ = list_for_user(db, user=user, unread_only=True)
    marked = 0
    for item in items:
        mark_read(db, user=user, notification_id=item["id"])
        marked += 1
    return marked
