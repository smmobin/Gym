"""Workout plan CRUD with role-scoped access."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.enums import StaffRole
from app.models.member import Member
from app.models.user import User
from app.models.workout import WorkoutPlan
from app.services.members import trainer_can_view_member


class WorkoutPlanError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


def _get_member_or_404(db: Session, member_id: int) -> Member:
    member = db.get(Member, member_id)
    if member is None:
        raise WorkoutPlanError(404, "عضو یافت نشد.")
    return member


def ensure_can_read_plans(db: Session, user: User, member_id: int) -> None:
    if user.role in (StaffRole.MANAGER.value, StaffRole.RECEPTIONIST.value):
        return
    if user.role == StaffRole.TRAINER.value and trainer_can_view_member(
        db, trainer=user, member_id=member_id
    ):
        return
    raise WorkoutPlanError(403, "دسترسی مجاز نیست.")


def ensure_can_write_plans(db: Session, user: User, member_id: int) -> None:
    if user.role == StaffRole.MANAGER.value:
        return
    if user.role == StaffRole.TRAINER.value and trainer_can_view_member(
        db, trainer=user, member_id=member_id
    ):
        return
    # receptionist and others: write denied
    raise WorkoutPlanError(403, "دسترسی مجاز نیست.")


def plan_out_fields(plan: WorkoutPlan) -> dict:
    trainer = plan.trainer
    return {
        "id": plan.id,
        "member_id": plan.member_id,
        "trainer_user_id": plan.trainer_user_id,
        "trainer_full_name": trainer.full_name if trainer is not None else None,
        "title": plan.title,
        "body": plan.body,
        "created_at": plan.created_at,
        "updated_at": plan.updated_at,
    }


def list_plans(db: Session, *, user: User, member_id: int) -> list[WorkoutPlan]:
    _get_member_or_404(db, member_id)
    ensure_can_read_plans(db, user, member_id)
    stmt = (
        select(WorkoutPlan)
        .options(joinedload(WorkoutPlan.trainer))
        .where(WorkoutPlan.member_id == member_id)
        .order_by(WorkoutPlan.created_at.desc(), WorkoutPlan.id.desc())
    )
    return list(db.scalars(stmt).unique().all())


def create_plan(
    db: Session,
    *,
    user: User,
    member_id: int,
    title: str,
    body: Optional[str],
) -> WorkoutPlan:
    _get_member_or_404(db, member_id)
    ensure_can_write_plans(db, user, member_id)

    plan = WorkoutPlan(
        member_id=member_id,
        trainer_user_id=user.id,
        title=title,
        body=body,
    )
    db.add(plan)
    db.flush()
    db.refresh(plan)
    _ = plan.trainer
    return plan


def update_plan(
    db: Session,
    *,
    user: User,
    plan_id: int,
    title: Optional[str] = None,
    body: Optional[str] = None,
    body_set: bool = False,
) -> WorkoutPlan:
    plan = db.get(WorkoutPlan, plan_id)
    if plan is None:
        raise WorkoutPlanError(404, "برنامه یافت نشد.")

    ensure_can_write_plans(db, user, plan.member_id)

    if title is not None:
        plan.title = title
    if body_set:
        plan.body = body
    plan.updated_at = datetime.now(timezone.utc)
    db.flush()
    db.refresh(plan)
    _ = plan.trainer
    return plan
