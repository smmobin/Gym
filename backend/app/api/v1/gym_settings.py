"""Club settings: staff can read; manager can patch."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.db import get_db
from app.models.enums import StaffRole
from app.models.user import User
from app.schemas.gym_settings import GymSettingsOut, GymSettingsPatch
from app.services import gym_settings as settings_svc

router = APIRouter(tags=["gym-settings"])

_STAFF = (
    StaffRole.MANAGER.value,
    StaffRole.RECEPTIONIST.value,
    StaffRole.TRAINER.value,
)
_MANAGER = (StaffRole.MANAGER.value,)


def _raise(err: settings_svc.GymSettingsError) -> None:
    raise HTTPException(status_code=err.status_code, detail=err.detail) from err


@router.get("/gym-settings", response_model=GymSettingsOut)
def get_gym_settings(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_STAFF)),
) -> GymSettingsOut:
    try:
        row = settings_svc.get_settings_for_staff(db, user=user)
        # Persist auto-created defaults if missing
        db.commit()
        db.refresh(row)
    except settings_svc.GymSettingsError as err:
        db.rollback()
        _raise(err)
        raise  # pragma: no cover
    return GymSettingsOut.model_validate(row)


@router.patch("/gym-settings", response_model=GymSettingsOut)
def patch_gym_settings(
    body: GymSettingsPatch,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_MANAGER)),
) -> GymSettingsOut:
    updates = body.model_dump(exclude_unset=True)
    try:
        row = settings_svc.patch_settings(db, user=user, updates=updates)
        db.commit()
        db.refresh(row)
    except settings_svc.GymSettingsError as err:
        db.rollback()
        _raise(err)
        raise  # pragma: no cover
    return GymSettingsOut.model_validate(row)
