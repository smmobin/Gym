"""Workout plan list/create/update + exercise catalog endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.db import get_db
from app.models.enums import StaffRole
from app.models.user import User
from app.schemas.workout_plans import (
    WorkoutExerciseCreate,
    WorkoutExerciseListResponse,
    WorkoutExerciseOut,
    WorkoutPlanCreate,
    WorkoutPlanListResponse,
    WorkoutPlanOut,
    WorkoutPlanUpdate,
)
from app.services import workout_plans as plan_svc

router = APIRouter(tags=["workout-plans"])

_STAFF_ALL = (
    StaffRole.MANAGER.value,
    StaffRole.RECEPTIONIST.value,
    StaffRole.TRAINER.value,
)
_WRITE = (StaffRole.MANAGER.value, StaffRole.TRAINER.value)


def _raise(err: plan_svc.WorkoutPlanError) -> None:
    raise HTTPException(status_code=err.status_code, detail=err.detail) from err


def _plan_out(row) -> WorkoutPlanOut:
    return WorkoutPlanOut(**plan_svc.plan_out_fields(row))


@router.get("/workout-exercises", response_model=WorkoutExerciseListResponse)
def list_workout_exercises(
    q: str = Query(default=""),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_STAFF_ALL)),
) -> WorkoutExerciseListResponse:
    try:
        rows = plan_svc.list_exercises(db, user=user, q=q)
    except plan_svc.WorkoutPlanError as err:
        _raise(err)
        raise  # pragma: no cover
    return WorkoutExerciseListResponse(
        items=[WorkoutExerciseOut.model_validate(r) for r in rows],
        total=len(rows),
    )


@router.post(
    "/workout-exercises",
    response_model=WorkoutExerciseOut,
    status_code=status.HTTP_201_CREATED,
)
def create_workout_exercise(
    body: WorkoutExerciseCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_WRITE)),
) -> WorkoutExerciseOut:
    try:
        row = plan_svc.get_or_create_exercise(db, user=user, name=body.name)
        db.commit()
        db.refresh(row)
    except plan_svc.WorkoutPlanError as err:
        db.rollback()
        _raise(err)
        raise  # pragma: no cover
    return WorkoutExerciseOut.model_validate(row)


@router.get(
    "/members/{member_id}/workout-plans",
    response_model=WorkoutPlanListResponse,
)
def list_member_workout_plans(
    member_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_STAFF_ALL)),
) -> WorkoutPlanListResponse:
    try:
        rows = plan_svc.list_plans(db, user=user, member_id=member_id)
    except plan_svc.WorkoutPlanError as err:
        _raise(err)
        raise  # pragma: no cover
    return WorkoutPlanListResponse(
        member_id=member_id,
        items=[_plan_out(r) for r in rows],
        total=len(rows),
    )


@router.post(
    "/members/{member_id}/workout-plans",
    response_model=WorkoutPlanOut,
    status_code=status.HTTP_201_CREATED,
)
def create_member_workout_plan(
    member_id: int,
    body: WorkoutPlanCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_WRITE)),
) -> WorkoutPlanOut:
    try:
        row = plan_svc.create_plan(
            db,
            user=user,
            member_id=member_id,
            title=body.title,
            body=body.body,
            items=body.items or None,
        )
        db.commit()
        db.refresh(row)
        _ = row.trainer
    except plan_svc.WorkoutPlanError as err:
        db.rollback()
        _raise(err)
        raise  # pragma: no cover
    return _plan_out(row)


@router.patch("/workout-plans/{plan_id}", response_model=WorkoutPlanOut)
def patch_workout_plan(
    plan_id: int,
    body: WorkoutPlanUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_WRITE)),
) -> WorkoutPlanOut:
    data = body.model_dump(exclude_unset=True)
    try:
        row = plan_svc.update_plan(
            db,
            user=user,
            plan_id=plan_id,
            title=data.get("title"),
            body=data.get("body") if "body" in data else None,
            body_set="body" in data and "items" not in data,
            items=data.get("items") if "items" in data else None,
            items_set="items" in data,
        )
        db.commit()
        db.refresh(row)
        _ = row.trainer
    except plan_svc.WorkoutPlanError as err:
        db.rollback()
        _raise(err)
        raise  # pragma: no cover
    return _plan_out(row)
