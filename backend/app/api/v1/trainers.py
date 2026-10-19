"""Trainer list and member–trainer assignment endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.db import get_db
from app.models.enums import StaffRole
from app.models.user import User
from app.schemas.trainers import (
    AssignmentListResponse,
    AssignmentOut,
    AssignTrainerRequest,
    AssignTrainerResponse,
    EndAssignmentResponse,
    TrainerListResponse,
    TrainerOut,
)
from app.services import trainers as trainer_svc

router = APIRouter(tags=["trainers"])

_DESK = (StaffRole.MANAGER.value, StaffRole.RECEPTIONIST.value)
_STAFF_ALL = (
    StaffRole.MANAGER.value,
    StaffRole.RECEPTIONIST.value,
    StaffRole.TRAINER.value,
)


def _raise(err: trainer_svc.TrainerError) -> None:
    raise HTTPException(status_code=err.status_code, detail=err.detail) from err


def _assignment_out(row) -> AssignmentOut:
    return AssignmentOut(**trainer_svc.assignment_out_fields(row))


@router.get("/trainers", response_model=TrainerListResponse)
def list_trainers(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_DESK)),
) -> TrainerListResponse:
    try:
        items = trainer_svc.list_trainers(db, user=user)
    except trainer_svc.TrainerError as err:
        _raise(err)
        raise  # pragma: no cover
    return TrainerListResponse(
        items=[TrainerOut.model_validate(t) for t in items],
        total=len(items),
    )


@router.get(
    "/members/{member_id}/trainers",
    response_model=AssignmentListResponse,
)
def list_member_trainers(
    member_id: int,
    include_history: bool = Query(default=False),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_STAFF_ALL)),
) -> AssignmentListResponse:
    try:
        rows = trainer_svc.list_member_assignments(
            db,
            user=user,
            member_id=member_id,
            include_history=include_history,
        )
    except trainer_svc.TrainerError as err:
        _raise(err)
        raise  # pragma: no cover
    return AssignmentListResponse(
        member_id=member_id,
        items=[_assignment_out(r) for r in rows],
        total=len(rows),
    )


@router.post(
    "/members/{member_id}/trainers",
    response_model=AssignTrainerResponse,
    status_code=status.HTTP_201_CREATED,
)
def assign_member_trainer(
    member_id: int,
    body: AssignTrainerRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_DESK)),
) -> AssignTrainerResponse:
    try:
        row = trainer_svc.assign_trainer(
            db,
            user=user,
            member_id=member_id,
            trainer_user_id=body.trainer_user_id,
        )
        db.commit()
        db.refresh(row)
        _ = row.trainer
    except trainer_svc.TrainerError as err:
        db.rollback()
        _raise(err)
        raise  # pragma: no cover
    return AssignTrainerResponse(assignment=_assignment_out(row))


@router.post(
    "/members/{member_id}/trainers/{assignment_id}/end",
    response_model=EndAssignmentResponse,
)
def end_member_trainer(
    member_id: int,
    assignment_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_DESK)),
) -> EndAssignmentResponse:
    try:
        row = trainer_svc.end_assignment(
            db,
            user=user,
            member_id=member_id,
            assignment_id=assignment_id,
        )
        db.commit()
        db.refresh(row)
        _ = row.trainer
    except trainer_svc.TrainerError as err:
        db.rollback()
        _raise(err)
        raise  # pragma: no cover
    return EndAssignmentResponse(assignment=_assignment_out(row))
