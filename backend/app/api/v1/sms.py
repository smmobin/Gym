"""SMS status + desk template send (manager/receptionist only; no OTP)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.config import Settings, get_settings
from app.core.db import get_db
from app.models.enums import StaffRole
from app.models.user import User
from app.schemas.sms import (
    SmsCustomSendRequest,
    SmsSendRequest,
    SmsSendResponse,
    SmsStatusResponse,
    SmsTemplateListResponse,
    SmsTemplateOut,
)
from app.services import sms_send as sms_svc

router = APIRouter(tags=["sms"])

_DESK = (StaffRole.MANAGER.value, StaffRole.RECEPTIONIST.value)


def _raise_sms(err: sms_svc.SmsSendError) -> None:
    raise HTTPException(status_code=err.status_code, detail=err.detail) from err


@router.get("/sms/status", response_model=SmsStatusResponse)
def sms_status(settings: Settings = Depends(get_settings)) -> SmsStatusResponse:
    """Non-sensitive flag for desk UI. No API keys."""
    return SmsStatusResponse(**sms_svc.sms_status(settings))


@router.get("/sms/templates", response_model=SmsTemplateListResponse)
def sms_templates(
    _user: User = Depends(require_roles(*_DESK)),
) -> SmsTemplateListResponse:
    items = [SmsTemplateOut(**t) for t in sms_svc.templates_for_api()]
    return SmsTemplateListResponse(items=items, total=len(items))


@router.post("/sms/send", response_model=SmsSendResponse)
def sms_send(
    body: SmsSendRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_DESK)),
    settings: Settings = Depends(get_settings),
) -> SmsSendResponse:
    try:
        outcome = sms_svc.send_template_to_member(
            db,
            settings=settings,
            actor=user,
            template_id=body.template_id,
            member_id=body.member_id,
        )
        db.commit()
    except sms_svc.SmsSendError as err:
        db.rollback()
        _raise_sms(err)
        raise  # pragma: no cover
    return SmsSendResponse(
        ok=outcome.ok,
        template_id=outcome.template_id,
        member_id=outcome.member_id,
        display_id=outcome.display_id,
        provider=outcome.provider,
        message_id=outcome.message_id,
        detail=outcome.detail,
    )


@router.post("/sms/send-custom", response_model=SmsSendResponse)
def sms_send_custom(
    body: SmsCustomSendRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_DESK)),
    settings: Settings = Depends(get_settings),
) -> SmsSendResponse:
    message = body.cleaned_message()
    if not message:
        raise HTTPException(status_code=422, detail="متن پیامک خالی است.")
    try:
        outcome = sms_svc.send_custom_to_member(
            db,
            settings=settings,
            actor=user,
            member_id=body.member_id,
            message=message,
        )
        db.commit()
    except sms_svc.SmsSendError as err:
        db.rollback()
        _raise_sms(err)
        raise  # pragma: no cover
    return SmsSendResponse(
        ok=outcome.ok,
        template_id=outcome.template_id,
        member_id=outcome.member_id,
        display_id=outcome.display_id,
        provider=outcome.provider,
        message_id=outcome.message_id,
        detail=outcome.detail,
    )
