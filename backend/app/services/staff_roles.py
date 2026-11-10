"""Staff desk vs trainer acting role helpers (Slice J: also_trainer)."""

from __future__ import annotations

from sqlalchemy import and_, or_

from app.models.enums import StaffRole
from app.models.user import User

DESK_ROLES = frozenset(
    {StaffRole.MANAGER.value, StaffRole.RECEPTIONIST.value}
)
TRAINER_ROLE = StaffRole.TRAINER.value
ALL_STAFF_ROLES = frozenset({*DESK_ROLES, TRAINER_ROLE})


def effective_role(user: User) -> str:
    """Session acting role when set; otherwise permanent users.role."""
    acting = getattr(user, "acting_role", None)
    if isinstance(acting, str) and acting.strip():
        return acting.strip()
    return user.role


def attach_acting_role(user: User, role: str) -> User:
    """Bind non-persisted acting_role for this request (do not flush as users.role)."""
    user.acting_role = role  # type: ignore[attr-defined]
    return user


def staff_can_act_as(user: User, role: str) -> bool:
    """Whether this account may open a session with the given acting role."""
    if not user.is_active:
        return False
    if role == user.role:
        return True
    if (
        role == TRAINER_ROLE
        and bool(getattr(user, "also_trainer", False))
        and user.role in DESK_ROLES
    ):
        return True
    return False


def is_trainer_capable(user: User) -> bool:
    """Account may appear in trainer lists / be assigned as class trainer."""
    if not user.is_active:
        return False
    if user.role == TRAINER_ROLE:
        return True
    return bool(getattr(user, "also_trainer", False)) and user.role in DESK_ROLES


def trainer_capable_clause():
    """SQLAlchemy filter: pure trainers OR desk staff with also_trainer."""
    return or_(
        User.role == TRAINER_ROLE,
        and_(
            User.also_trainer.is_(True),
            User.role.in_(tuple(DESK_ROLES)),
        ),
    )


def normalize_also_trainer(*, role: str, also_trainer: bool | None) -> bool:
    """Flag only applies to desk roles; pure trainers stay false."""
    if role not in DESK_ROLES:
        return False
    return bool(also_trainer)
