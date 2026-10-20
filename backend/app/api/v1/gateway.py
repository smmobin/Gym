"""Payment gateway status + server-side callback/verify (no client trust)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_athlete, require_roles
from app.core.config import Settings, get_settings
from app.core.db import get_db
from app.models.enums import StaffRole
from app.models.member import Member
from app.models.user import User
from app.schemas.billing import MembershipPlanListResponse, MembershipPlanOut, PaymentOut
from app.schemas.gateway import (
    GatewayStatusResponse,
    OnlinePaymentStartRequest,
    OnlinePaymentStartResponse,
)
from app.services import billing as billing_svc
from app.services import online_payments as online_svc

router = APIRouter(tags=["payments-gateway"])

_DESK = (StaffRole.MANAGER.value, StaffRole.RECEPTIONIST.value)


def _raise_online(err: online_svc.OnlinePaymentError) -> None:
    raise HTTPException(status_code=err.status_code, detail=err.detail) from err


@router.get("/payments/gateway/status", response_model=GatewayStatusResponse)
def payment_gateway_status(
    settings: Settings = Depends(get_settings),
) -> GatewayStatusResponse:
    """Non-sensitive flag for athlete + desk UI. No merchant secrets."""
    return GatewayStatusResponse(**online_svc.gateway_status(settings))


@router.get("/athlete/membership-plans", response_model=MembershipPlanListResponse)
def athlete_list_plans(
    db: Session = Depends(get_db),
    member: Member = Depends(get_current_athlete),
) -> MembershipPlanListResponse:
    """Active plans for athlete self-renew (session member only — no other member data)."""
    _ = member  # authz gate
    items = billing_svc.list_active_plans(db)
    return MembershipPlanListResponse(
        items=[MembershipPlanOut.model_validate(p) for p in items],
        total=len(items),
    )


@router.post(
    "/athlete/payments/online/start",
    response_model=OnlinePaymentStartResponse,
    status_code=201,
)
def athlete_start_online_payment(
    body: OnlinePaymentStartRequest,
    db: Session = Depends(get_db),
    member: Member = Depends(get_current_athlete),
    settings: Settings = Depends(get_settings),
) -> OnlinePaymentStartResponse:
    try:
        result = online_svc.start_athlete_online_payment(
            db,
            settings=settings,
            member=member,
            purpose=body.purpose,
            amount_toman=body.amount_toman,
            plan_id=body.plan_id,
            base_membership_id=body.base_membership_id,
            note=body.note,
        )
        db.commit()
        db.refresh(result.payment)
    except online_svc.OnlinePaymentError as err:
        db.rollback()
        _raise_online(err)
        raise  # pragma: no cover
    return OnlinePaymentStartResponse(
        payment=PaymentOut.model_validate(result.payment),
        payment_url=result.payment_url,
        authority=result.authority,
        gateway=GatewayStatusResponse(**result.gateway),
    )


@router.get("/payments/gateway/callback")
def payment_gateway_callback(
    Authority: str | None = Query(default=None),
    Status: str | None = Query(default=None),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    """
    Zarinpal browser return. Server verifies; never trusts client alone.
    Query param names match Zarinpal (Authority, Status).
    """
    try:
        result = online_svc.handle_gateway_callback(
            db,
            settings=settings,
            authority=Authority or "",
            gateway_status_param=Status,
        )
        db.commit()
    except online_svc.OnlinePaymentError as err:
        db.rollback()
        if err.status_code >= 500:
            _raise_online(err)
        url = online_svc.front_return_url(
            settings, query={"pay": "error", "detail": err.detail[:120]}
        )
        if url:
            return RedirectResponse(url=url, status_code=302)
        _raise_online(err)
        raise  # pragma: no cover

    if result.redirect_url:
        return RedirectResponse(url=result.redirect_url, status_code=302)
    return {
        "outcome": result.outcome,
        "receipt_number": result.payment.receipt_number,
        "status": result.payment.status,
    }


@router.post(
    "/payments/online/start",
    response_model=OnlinePaymentStartResponse,
    status_code=201,
)
def desk_start_online_payment(
    body: OnlinePaymentStartRequest,
    member_id: int = Query(..., description="Member to charge (desk only)"),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_DESK)),
    settings: Settings = Depends(get_settings),
) -> OnlinePaymentStartResponse:
    """Optional desk-initiated online payment for a member."""
    _ = user
    try:
        member = billing_svc.load_member(db, member_id)
        result = online_svc.start_athlete_online_payment(
            db,
            settings=settings,
            member=member,
            purpose=body.purpose,
            amount_toman=body.amount_toman,
            plan_id=body.plan_id,
            base_membership_id=body.base_membership_id,
            note=body.note,
        )
        db.commit()
        db.refresh(result.payment)
    except billing_svc.BillingError as err:
        db.rollback()
        raise HTTPException(status_code=err.status_code, detail=err.detail) from err
    except online_svc.OnlinePaymentError as err:
        db.rollback()
        _raise_online(err)
        raise  # pragma: no cover
    return OnlinePaymentStartResponse(
        payment=PaymentOut.model_validate(result.payment),
        payment_url=result.payment_url,
        authority=result.authority,
        gateway=GatewayStatusResponse(**result.gateway),
    )
