"""Public trial form + desk trial-lead queue."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.db import get_db
from app.core.rate_limit import trial_lead_rate_limiter
from app.models.enums import StaffRole
from app.models.user import User
from app.schemas.trial_leads import (
    TrialLeadListResponse,
    TrialLeadOut,
    TrialLeadPatch,
    TrialLeadPublicCreate,
    TrialLeadPublicResponse,
)
from app.services import trial_leads as leads_svc

router = APIRouter(tags=["trial-leads"])

_DESK = (StaffRole.MANAGER.value, StaffRole.RECEPTIONIST.value)


def _raise(err: leads_svc.TrialLeadError) -> None:
    raise HTTPException(status_code=err.status_code, detail=err.detail) from err


@router.post(
    "/public/trial-leads",
    response_model=TrialLeadPublicResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_public_trial_lead(
    body: TrialLeadPublicCreate,
    request: Request,
    db: Session = Depends(get_db),
) -> TrialLeadPublicResponse:
    """No auth. Creates a queue row only — never a Member."""
    client = request.client.host if request.client else "unknown"
    if not trial_lead_rate_limiter.is_allowed(client):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="تعداد درخواست‌ها زیاد است. کمی بعد دوباره تلاش کنید.",
        )
    lead = leads_svc.create_public_lead(
        db,
        full_name=body.full_name,
        mobile=body.mobile,
        preferred_time_note=body.preferred_time_note,
        message=body.message,
    )
    db.commit()
    return TrialLeadPublicResponse(id=lead.id)


@router.get("/trial-leads", response_model=TrialLeadListResponse)
def list_trial_leads(
    status_filter: str | None = Query(default=None, alias="status", max_length=32),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_DESK)),
) -> TrialLeadListResponse:
    try:
        rows = leads_svc.list_leads(db, user=user, status=status_filter)
    except leads_svc.TrialLeadError as err:
        _raise(err)
        raise  # pragma: no cover
    return TrialLeadListResponse(
        items=[TrialLeadOut.model_validate(r) for r in rows],
        total=len(rows),
    )


@router.patch("/trial-leads/{lead_id}", response_model=TrialLeadOut)
def patch_trial_lead(
    lead_id: int,
    body: TrialLeadPatch,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_DESK)),
) -> TrialLeadOut:
    try:
        row = leads_svc.patch_lead(db, user=user, lead_id=lead_id, status=body.status)
        db.commit()
        db.refresh(row)
    except leads_svc.TrialLeadError as err:
        db.rollback()
        _raise(err)
        raise  # pragma: no cover
    return TrialLeadOut.model_validate(row)
