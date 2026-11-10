"""Manager «فعالیت سامانه»: readable subset of audit_logs + server error summaries.

Never reads backend/logs/*.log — only DB rows. Payloads are not exposed; only
summary text (redacted again on the way out) plus safe metadata.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.jalali import TEHRAN, gregorian_to_jalali
from app.core.redaction import redact_text
from app.models.audit import AuditLog
from app.models.enums import StaffRole
from app.models.system_event import SystemErrorEvent
from app.models.user import User
from app.services.reports import range_bounds_utc, today_tehran
from app.services.staff_roles import effective_role

DEFAULT_RANGE_DAYS = 7
MAX_RANGE_DAYS = 366
DEFAULT_LIMIT = 200
MAX_LIMIT = 500
EXPORT_MAX_ROWS = 5000

ACTIVITY_ACTIONS: dict[str, tuple[str, ...]] = {
    "auth": (
        "auth.login.success",
        "auth.login.failure",
        "auth.logout",
        "auth.otp.send",
        "auth.otp.verify.success",
        "auth.otp.verify.failure",
    ),
    "plans": ("plan.create", "plan.update", "plan.deactivate"),
    "memberships": (
        "membership.renew",
        "membership.renew_online",
        "membership.renew_online_failed",
        "membership.cancel",
        "membership.freeze",
        "membership.unfreeze",
    ),
    "payments": (
        "payment.create",
        "payment.refund",
        "payment.online_paid",
        "payment.online_failed",
        "payment.online_verify_error",
    ),
    "settings": ("gym_settings.patch",),
    "staff": ("staff.create", "staff.update", "staff.deactivate", "staff.password_reset"),
}
ERRORS_CATEGORY = "errors"
CATEGORIES = (*ACTIVITY_ACTIONS.keys(), ERRORS_CATEGORY)
_CATEGORY_BY_ACTION = {a: cat for cat, actions in ACTIVITY_ACTIONS.items() for a in actions}
_FAIL_SUFFIXES = (".failure", "_failed", "_error")


class ActivityError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


@dataclass(frozen=True)
class ActivityItem:
    id: str
    source: str
    category: str
    action: str
    outcome: str
    created_at: datetime
    actor_name: str | None
    actor_role: str | None
    summary: str
    request_id: str | None
    method: str | None = None
    path: str | None = None
    status_code: int | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "source": self.source,
            "category": self.category,
            "action": self.action,
            "outcome": self.outcome,
            "created_at": self.created_at,
            "actor_name": self.actor_name,
            "actor_role": self.actor_role,
            "summary": self.summary,
            "request_id": self.request_id,
            "method": self.method,
            "path": self.path,
            "status_code": self.status_code,
        }


@dataclass(frozen=True)
class ActivityPage:
    items: list[ActivityItem]
    from_date: date
    to_date: date
    next_cursor: str | None


def ensure_manager(user: User) -> None:
    if effective_role(user) != StaffRole.MANAGER.value:
        raise ActivityError(403, "فقط مدیر به فعالیت سامانه دسترسی دارد.")


def resolve_activity_range(
    from_raw: date | None, to_raw: date | None, *, today: date | None = None
) -> tuple[date, date]:
    end = to_raw or today or today_tehran()
    start = from_raw or (end - timedelta(days=DEFAULT_RANGE_DAYS - 1))
    if end < start:
        raise ActivityError(422, "تاریخ پایان نمی‌تواند قبل از تاریخ شروع باشد.")
    if (end - start).days + 1 > MAX_RANGE_DAYS:
        raise ActivityError(422, "بازهٔ فعالیت حداکثر یک سال است.")
    return start, end


def _parse_cursor(raw: str | None) -> datetime | None:
    if not raw:
        return None
    try:
        value = datetime.fromisoformat(raw.strip())
    except ValueError as err:
        raise ActivityError(422, "نشانگر صفحه نامعتبر است.") from err
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _outcome(action: str, payload: dict[str, Any] | None) -> str:
    if action.endswith(_FAIL_SUFFIXES):
        return "fail"
    if isinstance(payload, dict) and payload.get("ok") is False:
        return "fail"
    return "ok"


def _audit_items(
    db: Session,
    *,
    start: datetime,
    end: datetime,
    actions: tuple[str, ...],
    q: str | None,
    limit: int,
) -> list[ActivityItem]:
    if not actions:
        return []
    stmt = (
        select(AuditLog, User.full_name, User.role)
        .outerjoin(User, User.id == AuditLog.actor_user_id)
        .where(
            AuditLog.created_at >= start,
            AuditLog.created_at < end,
            AuditLog.action.in_(actions),
        )
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .limit(limit)
    )
    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            or_(
                AuditLog.summary.ilike(like),
                AuditLog.action.ilike(like),
                AuditLog.request_id.ilike(like),
                User.full_name.ilike(like),
            )
        )
    out: list[ActivityItem] = []
    for row, full_name, role in db.execute(stmt).all():
        payload = row.payload if isinstance(row.payload, dict) else None
        actor_name = full_name or (payload or {}).get("actor_label")
        actor_role = role or (payload or {}).get("role")
        out.append(
            ActivityItem(
                id=f"a-{row.id}",
                source="audit",
                category=_CATEGORY_BY_ACTION.get(row.action, "other"),
                action=row.action,
                outcome=_outcome(row.action, payload),
                created_at=row.created_at,
                actor_name=actor_name,
                actor_role=actor_role,
                summary=redact_text(row.summary or row.action),
                request_id=row.request_id,
            )
        )
    return out


def _error_items(
    db: Session, *, start: datetime, end: datetime, q: str | None, limit: int
) -> list[ActivityItem]:
    stmt = (
        select(SystemErrorEvent)
        .where(SystemErrorEvent.created_at >= start, SystemErrorEvent.created_at < end)
        .order_by(SystemErrorEvent.created_at.desc(), SystemErrorEvent.id.desc())
        .limit(limit)
    )
    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            or_(
                SystemErrorEvent.summary.ilike(like),
                SystemErrorEvent.path.ilike(like),
                SystemErrorEvent.request_id.ilike(like),
                SystemErrorEvent.error_type.ilike(like),
            )
        )
    return [
        ActivityItem(
            id=f"e-{row.id}",
            source="error",
            category=ERRORS_CATEGORY,
            action=f"server.http_{row.status_code}",
            outcome="fail",
            created_at=row.created_at,
            actor_name=None,
            actor_role=None,
            summary=redact_text(row.summary or f"خطای سرور {row.status_code}"),
            request_id=row.request_id,
            method=row.method,
            path=row.path,
            status_code=row.status_code,
        )
        for row in db.scalars(stmt).all()
    ]


def list_activity(
    db: Session,
    *,
    user: User,
    from_date: date | None = None,
    to_date: date | None = None,
    q: str | None = None,
    category: str | None = None,
    cursor: str | None = None,
    limit: int = DEFAULT_LIMIT,
) -> ActivityPage:
    ensure_manager(user)
    start_d, end_d = resolve_activity_range(from_date, to_date)
    if category and category not in CATEGORIES:
        raise ActivityError(422, "دستهٔ فعالیت نامعتبر است.")
    limit = max(1, min(int(limit), EXPORT_MAX_ROWS))
    start, end = range_bounds_utc(start_d, end_d)
    before = _parse_cursor(cursor)
    if before is not None and before < end:
        end = before
    query = (q or "").strip()[:80] or None

    if category == ERRORS_CATEGORY:
        actions: tuple[str, ...] = ()
    elif category:
        actions = ACTIVITY_ACTIONS[category]
    else:
        actions = tuple(_CATEGORY_BY_ACTION)

    # Fetch limit+1 from each source, merge, then cut → stable next_cursor.
    fetch = limit + 1
    items = _audit_items(db, start=start, end=end, actions=actions, q=query, limit=fetch)
    if category in (None, ERRORS_CATEGORY):
        items += _error_items(db, start=start, end=end, q=query, limit=fetch)
    items.sort(key=lambda i: i.created_at, reverse=True)

    next_cursor = None
    if len(items) > limit:
        items = items[:limit]
        next_cursor = items[-1].created_at.isoformat()
    return ActivityPage(items=items, from_date=start_d, to_date=end_d, next_cursor=next_cursor)


_CATEGORY_FA = {
    "auth": "ورود/خروج",
    "plans": "طرح",
    "memberships": "عضویت",
    "payments": "پرداخت",
    "settings": "تنظیمات",
    "staff": "کارکنان",
    "errors": "خطای سرور",
}


def _jalali_stamp(value: datetime) -> str:
    local = value.astimezone(TEHRAN)
    jy, jm, jd = gregorian_to_jalali(local.year, local.month, local.day)
    return f"{jy:04d}/{jm:02d}/{jd:02d} {local:%H:%M:%S}"


def export_filename(from_date: date, to_date: date) -> str:
    return f"gym-activity-{from_date:%Y%m%d}-{to_date:%Y%m%d}.log"


def render_activity_log(page: ActivityPage, *, generated_by: str) -> str:
    """Plain UTF-8 text, one event per line (grep-friendly, Latin digits)."""
    now = datetime.now(tz=TEHRAN)
    lines = [
        "# GYM CONTROL — فعالیت سامانه (خروجی مدیر)",
        f"# بازه: {page.from_date.isoformat()} تا {page.to_date.isoformat()} (Asia/Tehran)",
        f"# تهیه: {_jalali_stamp(now)} توسط {generated_by}",
        f"# تعداد ردیف: {len(page.items)}",
        "# ستون‌ها: زمان ISO | تاریخ جلالی | دسته | نتیجه | رویداد | کاربر | خلاصه | request_id",
        "",
    ]
    for item in page.items:
        actor = item.actor_name or "—"
        if item.actor_role:
            actor = f"{actor} ({item.actor_role})"
        summary = item.summary
        if item.source == "error":
            summary = f"{summary} · {item.method} {item.path} → {item.status_code}"
        fields = [
            item.created_at.astimezone(TEHRAN).isoformat(timespec="seconds"),
            _jalali_stamp(item.created_at),
            _CATEGORY_FA.get(item.category, item.category),
            "ok" if item.outcome == "ok" else "FAIL",
            item.action,
            actor,
            summary.replace("\n", " ").replace("|", "/"),
            f"rid={item.request_id or '-'}",
        ]
        lines.append(" | ".join(fields))
    if page.next_cursor:
        lines.append("")
        lines.append(f"# بریده شد: بیش از {len(page.items)} ردیف — بازه را کوتاه‌تر کنید.")
    return redact_text("\n".join(lines) + "\n")
