"""Public trial form → desk queue. Never auto-creates a Member."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.enums import StaffRole, TrialLeadStatus
from app.models.trial_lead import TrialLead
from app.models.user import User

_STATUSES = {s.value for s in TrialLeadStatus}


class TrialLeadError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


def ensure_desk(user: User) -> None:
    if user.role not in {StaffRole.MANAGER.value, StaffRole.RECEPTIONIST.value}:
        raise TrialLeadError(403, "دسترسی مجاز نیست.")


def create_public_lead(
    db: Session,
    *,
    full_name: str,
    mobile: str,
    preferred_time_note: str | None = None,
    message: str | None = None,
) -> TrialLead:
    lead = TrialLead(
        full_name=full_name,
        mobile=mobile,
        preferred_time_note=preferred_time_note,
        message=message,
        status=TrialLeadStatus.NEW.value,
    )
    db.add(lead)
    db.flush()
    return lead


def list_leads(
    db: Session,
    *,
    user: User,
    status: str | None = None,
) -> list[TrialLead]:
    ensure_desk(user)
    stmt = select(TrialLead).order_by(TrialLead.created_at.desc(), TrialLead.id.desc())
    if status:
        if status not in _STATUSES:
            raise TrialLeadError(422, "وضعیت فیلتر نامعتبر است.")
        stmt = stmt.where(TrialLead.status == status)
    return list(db.scalars(stmt).all())


def patch_lead(
    db: Session,
    *,
    user: User,
    lead_id: int,
    status: str,
) -> TrialLead:
    ensure_desk(user)
    if status not in _STATUSES:
        raise TrialLeadError(422, "وضعیت نامعتبر است.")
    lead = db.get(TrialLead, lead_id)
    if lead is None:
        raise TrialLeadError(404, "درخواست یافت نشد.")
    lead.status = status
    lead.updated_at = datetime.now(tz=timezone.utc)
    db.flush()
    return lead
