"""Staff management API — manager: receptionist+trainer; receptionist: trainer only."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.db import get_db
from app.models.enums import StaffRole
from app.models.user import User
from app.schemas.auth import UserOut
from app.schemas.staff import (
    StaffCreateRequest,
    StaffListResponse,
    StaffMutationResponse,
    StaffUpdateRequest,
)
from app.services import staff as staff_svc

router = APIRouter(prefix="/staff", tags=["staff"])

_DESK = (StaffRole.MANAGER.value, StaffRole.RECEPTIONIST.value)


def _raise(err: staff_svc.StaffError) -> None:
    raise HTTPException(status_code=err.status_code, detail=err.detail) from err


@router.get("", response_model=StaffListResponse)
def list_staff(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_DESK)),
) -> StaffListResponse:
    try:
        items = staff_svc.list_staff(db, actor=user)
    except staff_svc.StaffError as err:
        _raise(err)
        raise  # pragma: no cover
    return StaffListResponse(
        items=[UserOut.model_validate(u) for u in items],
        total=len(items),
    )


@router.post("", response_model=StaffMutationResponse, status_code=status.HTTP_201_CREATED)
def create_staff(
    body: StaffCreateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_DESK)),
) -> StaffMutationResponse:
    try:
        row = staff_svc.create_staff(
            db,
            actor=user,
            mobile=body.mobile,
            password=body.password,
            full_name=body.full_name,
            role=body.role,
        )
        db.commit()
        db.refresh(row)
    except staff_svc.StaffError as err:
        db.rollback()
        _raise(err)
        raise  # pragma: no cover
    return StaffMutationResponse(user=UserOut.model_validate(row))


@router.patch("/{user_id}", response_model=StaffMutationResponse)
def update_staff(
    user_id: int,
    body: StaffUpdateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_DESK)),
) -> StaffMutationResponse:
    if body.is_active is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="تغییر وضعیت فعال/غیرفعال کارکنان از پنل در این نسخه فعال نیست.",
        )
    try:
        row = staff_svc.update_staff(
            db,
            actor=user,
            user_id=user_id,
            mobile=body.mobile,
            full_name=body.full_name,
            role=body.role,
            password=body.password,
            is_active=None,
        )
        db.commit()
        db.refresh(row)
    except staff_svc.StaffError as err:
        db.rollback()
        _raise(err)
        raise  # pragma: no cover
    return StaffMutationResponse(user=UserOut.model_validate(row))


@router.post("/{user_id}/deactivate", response_model=StaffMutationResponse)
def deactivate_staff(
    user_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_DESK)),
) -> StaffMutationResponse:
    _ = (db, user, user_id)
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="غیرفعال‌سازی کارکنان از پنل در این نسخه فعال نیست.",
    )


@router.post("/{user_id}/activate", response_model=StaffMutationResponse)
def activate_staff(
    user_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_DESK)),
) -> StaffMutationResponse:
    _ = (db, user, user_id)
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="فعال‌سازی مجدد کارکنان از پنل در این نسخه فعال نیست.",
    )
