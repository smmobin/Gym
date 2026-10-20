"""Member helpers: display_id sequence and trainer visibility."""

from __future__ import annotations

import re
from datetime import date
from typing import Iterable

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models.enums import MemberStatus, MembershipStatus, StaffRole
from app.models.member import Member
from app.models.membership import Membership
from app.models.trainer import TrainerMemberAssignment
from app.models.user import User
from app.schemas.members import MemberOut

_DISPLAY_RE = re.compile(r"^M-(\d+)$", re.IGNORECASE)
_DISPLAY_START = 1001


def next_display_id(db: Session) -> str:
    """Continue sequential M-1001… from the highest existing display_id number."""
    rows = db.scalars(select(Member.display_id)).all()
    max_n = _DISPLAY_START - 1
    for value in rows:
        match = _DISPLAY_RE.match(value or "")
        if match:
            max_n = max(max_n, int(match.group(1)))
    return f"M-{max_n + 1}"


def active_trainee_member_ids(db: Session, trainer_user_id: int) -> set[int]:
    stmt = select(TrainerMemberAssignment.member_id).where(
        TrainerMemberAssignment.trainer_user_id == trainer_user_id,
        TrainerMemberAssignment.ended_at.is_(None),
    )
    return set(db.scalars(stmt).all())


def trainer_can_view_member(db: Session, *, trainer: User, member_id: int) -> bool:
    return member_id in active_trainee_member_ids(db, trainer.id)


def member_by_mobile(db: Session, mobile: str) -> Member | None:
    return db.scalar(select(Member).where(Member.mobile == mobile))


def build_member_list_query(
    db: Session,
    *,
    user: User,
    q: str | None = None,
    status: str | None = None,
    include_archived: bool = False,
):
    stmt = select(Member)

    if user.role == StaffRole.TRAINER.value:
        allowed_ids = active_trainee_member_ids(db, user.id)
        if not allowed_ids:
            stmt = stmt.where(Member.id == -1)  # empty
        else:
            stmt = stmt.where(Member.id.in_(allowed_ids))

    if status:
        stmt = stmt.where(Member.status == status)
    elif not include_archived:
        stmt = stmt.where(Member.status != MemberStatus.ARCHIVED.value)

    if q:
        term = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Member.first_name.ilike(term),
                Member.last_name.ilike(term),
                Member.mobile.ilike(term),
                Member.display_id.ilike(term),
                func.concat(Member.first_name, " ", Member.last_name).ilike(term),
            )
        )

    return stmt.order_by(Member.display_id.asc())


def members_with_active_membership(
    db: Session,
    member_ids: Iterable[int],
    *,
    today: date | None = None,
) -> set[int]:
    """Member ids that currently have an ACTIVE membership covering today."""
    ids = {int(i) for i in member_ids}
    if not ids:
        return set()
    day = today or date.today()
    rows = db.scalars(
        select(Membership.member_id)
        .where(
            Membership.member_id.in_(ids),
            Membership.status == MembershipStatus.ACTIVE.value,
            Membership.start_date <= day,
            Membership.end_date >= day,
        )
        .distinct()
    ).all()
    return set(rows)


def serialize_member(db: Session, member: Member, *, today: date | None = None) -> MemberOut:
    active = members_with_active_membership(db, [member.id], today=today)
    return MemberOut.model_validate(member).model_copy(
        update={"role": "athlete", "has_active_membership": member.id in active}
    )


def serialize_members(
    db: Session,
    members: Iterable[Member],
    *,
    today: date | None = None,
) -> list[MemberOut]:
    rows = list(members)
    active = members_with_active_membership(db, [m.id for m in rows], today=today)
    return [
        MemberOut.model_validate(m).model_copy(
            update={"role": "athlete", "has_active_membership": m.id in active}
        )
        for m in rows
    ]
