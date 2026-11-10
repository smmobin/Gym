"""Staff CRUD: manager creates receptionist+trainer; receptionist creates trainer only."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.enums import StaffRole
from app.models.member import Member
from app.models.user import User
from app.services.audit import write_audit
from app.services.auth_session import revoke_all_sessions_for_user
from app.services.staff_roles import DESK_ROLES, effective_role, normalize_also_trainer

_CREATABLE = {StaffRole.RECEPTIONIST.value, StaffRole.TRAINER.value}
MIN_PASSWORD_LEN = 8
_ROLE_FA = {
    StaffRole.MANAGER.value: "مدیر",
    StaffRole.RECEPTIONIST.value: "منشی",
    StaffRole.TRAINER.value: "مربی",
}


class StaffError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


def _assert_actor_can_manage_role(actor: User, role: str) -> None:
    actor_role = effective_role(actor)
    if actor_role == StaffRole.MANAGER.value:
        if role not in _CREATABLE:
            raise StaffError(403, "از پنل فقط منشی یا مربی قابل مدیریت است.")
        return
    if actor_role == StaffRole.RECEPTIONIST.value:
        if role != StaffRole.TRAINER.value:
            raise StaffError(403, "منشی فقط می‌تواند مربی بسازد یا مدیریت کند.")
        return
    raise StaffError(403, "دسترسی مجاز نیست.")


def _assert_actor_can_touch_user(
    actor: User,
    target: User,
    *,
    also_trainer_only: bool = False,
) -> None:
    actor_role = effective_role(actor)
    if target.role == StaffRole.MANAGER.value:
        if actor_role != StaffRole.MANAGER.value:
            raise StaffError(403, "مدیر از پنل قابل ویرایش نیست.")
        if not also_trainer_only:
            raise StaffError(
                403,
                "برای مدیر فقط می‌توان پرچم «مربی هم هست» را تغییر داد.",
            )
        return
    _assert_actor_can_manage_role(actor, target.role)


def list_staff(db: Session, *, actor: User) -> list[User]:
    actor_role = effective_role(actor)
    if actor_role == StaffRole.MANAGER.value:
        stmt = select(User).order_by(User.role.asc(), User.id.asc())
    elif actor_role == StaffRole.RECEPTIONIST.value:
        stmt = (
            select(User)
            .where(User.role == StaffRole.TRAINER.value)
            .order_by(User.id.asc())
        )
    else:
        raise StaffError(403, "دسترسی مجاز نیست.")
    return list(db.scalars(stmt).all())


def _ensure_mobile_unique(db: Session, mobile: str, *, exclude_user_id: int | None = None) -> None:
    stmt = select(User).where(User.mobile == mobile)
    if exclude_user_id is not None:
        stmt = stmt.where(User.id != exclude_user_id)
    if db.scalar(stmt) is not None:
        raise StaffError(409, "این شماره موبایل قبلاً برای کارکنان ثبت شده است.")


def create_staff(
    db: Session,
    *,
    actor: User,
    mobile: str,
    password: str,
    full_name: str,
    role: str,
    also_trainer: bool = False,
) -> User:
    _assert_actor_can_manage_role(actor, role)
    if len(password) < MIN_PASSWORD_LEN:
        raise StaffError(400, "رمز باید حداقل ۸ کاراکتر باشد.")
    _ensure_mobile_unique(db, mobile)

    flag = normalize_also_trainer(role=role, also_trainer=also_trainer)
    # Receptionist cannot set also_trainer on anyone but trainer role ignores it.
    if effective_role(actor) == StaffRole.RECEPTIONIST.value:
        flag = False

    row = User(
        mobile=mobile,
        password_hash=hash_password(password),
        full_name=full_name,
        role=role,
        also_trainer=flag,
        is_active=True,
    )
    db.add(row)
    db.flush()

    member_overlap = db.scalar(select(Member).where(Member.mobile == mobile))
    write_audit(
        db,
        actor_user_id=actor.id,
        action="staff.create",
        entity_type="user",
        entity_id=row.id,
        summary=f"ساخت کارکنان {full_name} با نقش {role}",
        payload={
            "mobile": mobile,
            "role": role,
            "also_trainer": flag,
            "member_mobile_overlap": member_overlap is not None,
        },
    )
    return row


def update_staff(
    db: Session,
    *,
    actor: User,
    user_id: int,
    mobile: str | None = None,
    full_name: str | None = None,
    role: str | None = None,
    password: str | None = None,
    is_active: bool | None = None,
    also_trainer: bool | None = None,
) -> User:
    target = db.get(User, user_id)
    if target is None:
        raise StaffError(404, "کاربر یافت نشد.")

    also_trainer_only = (
        target.role == StaffRole.MANAGER.value
        and also_trainer is not None
        and mobile is None
        and full_name is None
        and role is None
        and password is None
        and is_active is None
    )
    _assert_actor_can_touch_user(actor, target, also_trainer_only=also_trainer_only)

    role_before = target.role
    active_before = target.is_active
    also_before = bool(target.also_trainer)

    if role is not None and role != target.role:
        _assert_actor_can_manage_role(actor, role)
        if (
            effective_role(actor) == StaffRole.RECEPTIONIST.value
            and role != StaffRole.TRAINER.value
        ):
            raise StaffError(403, "منشی فقط می‌تواند مربی مدیریت کند.")
        target.role = role
        # Pure trainer cannot keep also_trainer.
        if role not in DESK_ROLES:
            target.also_trainer = False

    if mobile is not None and mobile != target.mobile:
        _ensure_mobile_unique(db, mobile, exclude_user_id=target.id)
        target.mobile = mobile

    if full_name is not None:
        target.full_name = full_name

    if password is not None:
        if len(password) < MIN_PASSWORD_LEN:
            raise StaffError(400, "رمز باید حداقل ۸ کاراکتر باشد.")
        target.password_hash = hash_password(password)

    if also_trainer is not None:
        if effective_role(actor) != StaffRole.MANAGER.value:
            raise StaffError(403, "فقط مدیر می‌تواند پرچم مربی هم‌زمان را تغییر دهد.")
        target.also_trainer = normalize_also_trainer(
            role=target.role, also_trainer=also_trainer
        )

    deactivated = False
    if is_active is not None and is_active != target.is_active:
        if is_active is False and target.id == actor.id:
            raise StaffError(400, "نمی‌توانید خودتان را غیرفعال کنید.")
        target.is_active = is_active
        if not is_active:
            revoke_all_sessions_for_user(db, user_id=target.id)
            deactivated = True

    db.flush()
    also_after = bool(target.also_trainer)
    payload = {
        "mobile": target.mobile,
        "role": target.role,
        "also_trainer": also_after,
        "is_active": target.is_active,
        "password_changed": password is not None,
        "before": {
            "role": role_before,
            "is_active": active_before,
            "also_trainer": also_before,
        },
    }
    if also_before != also_after:
        payload["after"] = {
            "role": target.role,
            "is_active": target.is_active,
            "also_trainer": also_after,
        }

    write_audit(
        db,
        actor_user_id=actor.id,
        action="staff.deactivate" if deactivated else "staff.update",
        entity_type="user",
        entity_id=target.id,
        summary=(
            f"تغییر نقش {target.full_name}: "
            f"{_ROLE_FA.get(role_before, role_before)} ← {_ROLE_FA.get(target.role, target.role)}"
            if role_before != target.role
            else (
                f"تغییر مربی‌هم‌زمان {target.full_name}: {also_before} ← {also_after}"
                if also_before != also_after
                else f"ویرایش کارکنان {target.full_name}"
            )
        ),
        payload=payload,
    )
    return target


def set_staff_active(
    db: Session,
    *,
    actor: User,
    user_id: int,
    is_active: bool,
) -> User:
    return update_staff(db, actor=actor, user_id=user_id, is_active=is_active)
