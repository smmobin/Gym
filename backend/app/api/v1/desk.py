"""Desk dashboard summary (receptionist + manager)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.db import get_db
from app.models.enums import StaffRole
from app.models.user import User
from app.schemas.desk import DeskSummaryResponse
from app.services import desk as desk_svc

router = APIRouter(tags=["desk"])

_DESK = (StaffRole.MANAGER.value, StaffRole.RECEPTIONIST.value)


def _raise(err: desk_svc.DeskError) -> None:
    raise HTTPException(status_code=err.status_code, detail=err.detail) from err


@router.get("/desk/summary", response_model=DeskSummaryResponse)
def desk_summary(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_DESK)),
) -> DeskSummaryResponse:
    try:
        data = desk_svc.build_desk_summary(db, user=user)
        db.commit()
    except desk_svc.DeskError as err:
        db.rollback()
        _raise(err)
        raise  # pragma: no cover
    return DeskSummaryResponse.model_validate(data)
