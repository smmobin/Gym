"""Trainer list and member–trainer assignment (multi-trainer allowed)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.enums import StaffRole
from app.models.member import Member
from app.models.trainer import TrainerMemberAssignment
from app.models.user import User
from app.services.members import trainer_can_view_member


class TrainerError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


def ensure_desk_staff(user: User) -> None:
    if user.role not in (StaffRole.MANAGER.value, StaffRole.RECEPTIONIST.value):
        raise TrainerError(403, "دسترسی مجاز نیست.")


def _get_member_or_404(db: Session, member_id: int) -> Member:
    member = db.get(Member, member_id)
    if member is None:
        raise TrainerError(404, "عضو یافت نشد.")
    return member


def ensure_can_view_member_assignments(db: Session, user: User, member_id: int) -> None:
    if user.role in (StaffRole.MANAGER.value, StaffRole.RECEPTIONIST.value):
        return
    if user.role == StaffRole.TRAINER.value and trainer_can_view_member(
        db, trainer=user, member_id=member_id
    ):
        return
    raise TrainerError(403, "دسترسی مجاز نیست.")


def list_trainers(db: Session, *, user: User) -> list[User]:
    ensure_desk_staff(user)
    stmt = (
        select(User)
        .where(
            User.role == StaffRole.TRAINER.value,
            User.is_active.is_(True),
        )
        .order_by(User.full_name.asc(), User.id.asc())
    )
    return list(db.scalars(stmt).all())


def active_assignment_pair(
    db: Session, *, trainer_user_id: int, member_id: int
) -> Optional[TrainerMemberAssignment]:
    stmt = (
        select(TrainerMemberAssignment)
        .where(
            TrainerMemberAssignment.trainer_user_id == trainer_user_id,
            TrainerMemberAssignment.member_id == member_id,
            TrainerMemberAssignment.ended_at.is_(None),
        )
        .limit(1)
    )
    return db.scalar(stmt)


def assignment_out_fields(assignment: TrainerMemberAssignment) -> dict:
    trainer = assignment.trainer
    return {
        "id": assignment.id,
        "trainer_user_id": assignment.trainer_user_id,
        "trainer_full_name": trainer.full_name if trainer is not None else None,
        "trainer_mobile": trainer.mobile if trainer is not None else None,
        "member_id": assignment.member_id,
        "assigned_at": assignment.assigned_at,
        "ended_at": assignment.ended_at,
        "is_active": assignment.ended_at is None,
    }


def list_member_assignments(
    db: Session,
    *,
    user: User,
    member_id: int,
    include_history: bool = False,
) -> list[TrainerMemberAssignment]:
    _get_member_or_404(db, member_id)
    ensure_can_view_member_assignments(db, user, member_id)
    stmt = (
        select(TrainerMemberAssignment)
        .options(joinedload(TrainerMemberAssignment.trainer))
        .where(TrainerMemberAssignment.member_id == member_id)
    )
    if not include_history:
        stmt = stmt.where(TrainerMemberAssignment.ended_at.is_(None))
    stmt = stmt.order_by(
        TrainerMemberAssignment.ended_at.is_(None).desc(),
        TrainerMemberAssignment.assigned_at.desc(),
    )
    return list(db.scalars(stmt).unique().all())


def assign_trainer(
    db: Session,
    *,
    user: User,
    member_id: int,
    trainer_user_id: int,
) -> TrainerMemberAssignment:
    ensure_desk_staff(user)
    _get_member_or_404(db, member_id)

    trainer = db.get(User, trainer_user_id)
    if (
        trainer is None
        or trainer.role != StaffRole.TRAINER.value
        or not trainer.is_active
    ):
        raise TrainerError(400, "کاربر انتخاب‌شده مربی فعال نیست.")

    if active_assignment_pair(db, trainer_user_id=trainer_user_id, member_id=member_id):
        raise TrainerError(409, "این مربی هم‌اکنون به این عضو واگذار شده است.")

    row = TrainerMemberAssignment(
        trainer_user_id=trainer_user_id,
        member_id=member_id,
    )
    db.add(row)
    db.flush()
    db.refresh(row)
    _ = row.trainer
    return row


def end_assignment(
    db: Session,
    *,
    user: User,
    member_id: int,
    assignment_id: int,
) -> TrainerMemberAssignment:
    ensure_desk_staff(user)
    _get_member_or_404(db, member_id)

    row = db.get(TrainerMemberAssignment, assignment_id)
    if row is None or row.member_id != member_id:
        raise TrainerError(404, "واگذاری یافت نشد.")
    if row.ended_at is not None:
        raise TrainerError(400, "این واگذاری قبلاً پایان یافته است.")

    row.ended_at = datetime.now(timezone.utc)
    db.flush()
    db.refresh(row)
    _ = row.trainer
    return row
