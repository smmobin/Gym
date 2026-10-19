"""Club settings (single logical row for باشگاه آذر)."""

from __future__ import annotations

from datetime import time
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.enums import StaffRole
from app.models.gym_settings import GymSettings
from app.models.user import User
from app.services.audit import write_audit

_DEFAULTS: dict[str, Any] = {
    "gym_name": "باشگاه آذر",
    "phone": None,
    "address": None,
    "day_end_time": time(23, 0),
    "expiry_warning_days": 7,
    "freeze_annual_cap_days": 14,
    "working_hours_note": None,
    "renewal_rules_note": None,
}

_PATCH_FIELDS = (
    "gym_name",
    "phone",
    "address",
    "day_end_time",
    "expiry_warning_days",
    "freeze_annual_cap_days",
    "working_hours_note",
    "renewal_rules_note",
)


class GymSettingsError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


def ensure_staff(user: User) -> None:
    if user.role not in {
        StaffRole.MANAGER.value,
        StaffRole.RECEPTIONIST.value,
        StaffRole.TRAINER.value,
    }:
        raise GymSettingsError(403, "دسترسی مجاز نیست.")


def ensure_manager(user: User) -> None:
    if user.role != StaffRole.MANAGER.value:
        raise GymSettingsError(403, "دسترسی مجاز نیست.")


def get_or_create_settings(db: Session) -> GymSettings:
    row = db.scalar(select(GymSettings).order_by(GymSettings.id.asc()).limit(1))
    if row is not None:
        return row
    row = GymSettings(**_DEFAULTS)
    db.add(row)
    db.flush()
    return row


def get_settings_for_staff(db: Session, *, user: User) -> GymSettings:
    ensure_staff(user)
    return get_or_create_settings(db)


def patch_settings(
    db: Session,
    *,
    user: User,
    updates: dict[str, Any],
) -> GymSettings:
    ensure_manager(user)
    row = get_or_create_settings(db)
    before: dict[str, Any] = {}
    after: dict[str, Any] = {}
    changed = False
    for key in _PATCH_FIELDS:
        if key not in updates:
            continue
        new_val = updates[key]
        old_val = getattr(row, key)
        if new_val == old_val:
            continue
        before[key] = (
            old_val.isoformat(timespec="minutes") if isinstance(old_val, time) else old_val
        )
        after[key] = (
            new_val.isoformat(timespec="minutes") if isinstance(new_val, time) else new_val
        )
        setattr(row, key, new_val)
        changed = True

    if changed:
        write_audit(
            db,
            actor_user_id=user.id,
            action="gym_settings.patch",
            entity_type="gym_settings",
            entity_id=row.id,
            summary="ویرایش تنظیمات باشگاه",
            payload={"before": before, "after": after},
        )
    db.flush()
    return row
