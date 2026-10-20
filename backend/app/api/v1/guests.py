"""Day-guest registration (desk only)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.db import get_db
from app.models.enums import StaffRole
from app.models.user import User
from app.schemas.guests import (
    DayGuestCreate,
    DayGuestMembershipOut,
    DayGuestPaymentOut,
    DayGuestResponse,
)
from app.services import guests as guests_svc
from app.services.members import serialize_member

router = APIRouter(tags=["guests"])

_DESK = (StaffRole.MANAGER.value, StaffRole.RECEPTIONIST.value)


def _raise(err: guests_svc.GuestError) -> None:
    raise HTTPException(status_code=err.status_code, detail=err.detail) from err


@router.post("/guests", response_model=DayGuestResponse, status_code=status.HTTP_201_CREATED)
def register_day_guest(
    body: DayGuestCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_DESK)),
) -> DayGuestResponse:
    try:
        result = guests_svc.register_day_guest(
            db,
            user=user,
            first_name=body.first_name,
            last_name=body.last_name,
            mobile=body.mobile,
            agreed_amount_toman=body.agreed_amount_toman,
            payment_method=body.payment_method or "cash",
            pay_now=body.pay_now,
            notes=body.notes,
        )
        db.commit()
        db.refresh(result.member)
        db.refresh(result.membership)
        if result.payment is not None:
            db.refresh(result.payment)
        _ = result.membership.plan
    except guests_svc.GuestError as err:
        db.rollback()
        _raise(err)
        raise  # pragma: no cover

    plan_name = result.membership.plan.name if result.membership.plan else None
    msg = (
        "عضو موجود بود؛ عضویت یک‌روزهٔ جدید ثبت شد."
        if result.reused_existing_member
        else "مهمان روزانه ثبت شد."
    )
    return DayGuestResponse(
        member=serialize_member(db, result.member),
        membership=DayGuestMembershipOut(
            id=result.membership.id,
            plan_id=result.membership.plan_id,
            plan_name=plan_name,
            agreed_amount_toman=result.membership.agreed_amount_toman,
            start_date=result.membership.start_date,
            end_date=result.membership.end_date,
            status=result.membership.status,
        ),
        payment=(
            DayGuestPaymentOut.model_validate(result.payment)
            if result.payment is not None
            else None
        ),
        reused_existing_member=result.reused_existing_member,
        message=msg,
    )
