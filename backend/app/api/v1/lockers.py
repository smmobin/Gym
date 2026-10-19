"""Locker list/create/update, assign, and release (desk only)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.db import get_db
from app.models.enums import StaffRole
from app.models.locker import LockerAssignment
from app.models.user import User
from app.schemas.lockers import (
    AssignRequest,
    AssignResponse,
    AssignmentOut,
    LockerCreate,
    LockerListResponse,
    LockerOut,
    LockerUpdate,
    MemberLockerResponse,
    ReleaseResponse,
)
from app.services import lockers as locker_svc

router = APIRouter(tags=["lockers"])

_DESK = (StaffRole.MANAGER.value, StaffRole.RECEPTIONIST.value)


def _raise(err: locker_svc.LockerError) -> None:
    raise HTTPException(status_code=err.status_code, detail=err.detail) from err


def _assignment_out(data: dict | LockerAssignment) -> AssignmentOut:
    if isinstance(data, LockerAssignment):
        fields = locker_svc.assignment_out_fields(data)
        return AssignmentOut(**fields)
    return AssignmentOut(**data)


def _locker_out(payload: dict) -> LockerOut:
    current = payload.get("current_assignment")
    return LockerOut(
        id=payload["id"],
        code=payload["code"],
        is_active=payload["is_active"],
        is_free=payload["is_free"],
        current_assignment=_assignment_out(current) if current else None,
    )


@router.get("/lockers", response_model=LockerListResponse)
def list_lockers(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_DESK)),
) -> LockerListResponse:
    try:
        items = locker_svc.list_lockers(db, user=user)
    except locker_svc.LockerError as err:
        _raise(err)
        raise  # pragma: no cover
    return LockerListResponse(items=[_locker_out(p) for p in items], total=len(items))


@router.post(
    "/lockers",
    response_model=LockerOut,
    status_code=status.HTTP_201_CREATED,
)
def create_locker(
    body: LockerCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_DESK)),
) -> LockerOut:
    try:
        payload = locker_svc.create_locker(
            db, user=user, code=body.code, is_active=body.is_active
        )
        db.commit()
    except locker_svc.LockerError as err:
        db.rollback()
        _raise(err)
        raise  # pragma: no cover
    return _locker_out(payload)


@router.patch("/lockers/{locker_id}", response_model=LockerOut)
def patch_locker(
    locker_id: int,
    body: LockerUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_DESK)),
) -> LockerOut:
    data = body.model_dump(exclude_unset=True)
    try:
        payload = locker_svc.update_locker(
            db,
            user=user,
            locker_id=locker_id,
            is_active=data.get("is_active"),
            code=data.get("code"),
        )
        db.commit()
    except locker_svc.LockerError as err:
        db.rollback()
        _raise(err)
        raise  # pragma: no cover
    return _locker_out(payload)


@router.post("/lockers/{locker_id}/assign", response_model=AssignResponse)
def assign_locker(
    locker_id: int,
    body: AssignRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_DESK)),
) -> AssignResponse:
    try:
        locker_payload, assignment = locker_svc.assign_locker(
            db,
            user=user,
            locker_id=locker_id,
            member_id=body.member_id,
            membership_id=body.membership_id,
            note=body.note,
        )
        db.commit()
        db.refresh(assignment)
        _ = assignment.member
    except locker_svc.LockerError as err:
        db.rollback()
        _raise(err)
        raise  # pragma: no cover
    return AssignResponse(
        locker=_locker_out(locker_payload),
        assignment=_assignment_out(assignment),
    )


@router.post("/lockers/{locker_id}/release", response_model=ReleaseResponse)
def release_locker(
    locker_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_DESK)),
) -> ReleaseResponse:
    try:
        locker_payload, assignment = locker_svc.release_locker(
            db, user=user, locker_id=locker_id
        )
        db.commit()
        db.refresh(assignment)
        _ = assignment.member
    except locker_svc.LockerError as err:
        db.rollback()
        _raise(err)
        raise  # pragma: no cover
    return ReleaseResponse(
        locker=_locker_out(locker_payload),
        assignment=_assignment_out(assignment),
    )


@router.get("/members/{member_id}/locker", response_model=MemberLockerResponse)
def get_member_locker(
    member_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_DESK)),
) -> MemberLockerResponse:
    try:
        data = locker_svc.member_current_locker(db, user=user, member_id=member_id)
    except locker_svc.LockerError as err:
        _raise(err)
        raise  # pragma: no cover
    locker = data["locker"]
    assignment = data["assignment"]
    return MemberLockerResponse(
        member_id=data["member_id"],
        locker=_locker_out(locker) if locker else None,
        assignment=_assignment_out(assignment) if assignment else None,
    )
