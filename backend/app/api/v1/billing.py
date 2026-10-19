"""Membership plans, renew, payments, refunds."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.db import get_db
from app.models.enums import StaffRole
from app.models.membership import Membership
from app.models.user import User
from app.schemas.billing import (
    CancelMembershipResponse,
    CreatePaymentRequest,
    MembershipListResponse,
    MembershipOut,
    MembershipPlanListResponse,
    MembershipPlanOut,
    PaymentListResponse,
    PaymentMutationResponse,
    PaymentOut,
    RenewMembershipRequest,
    RenewMembershipResponse,
)
from app.services import billing as billing_svc

router = APIRouter(tags=["billing"])

_DESK = (StaffRole.MANAGER.value, StaffRole.RECEPTIONIST.value)


def _raise(err: billing_svc.BillingError) -> None:
    raise HTTPException(status_code=err.status_code, detail=err.detail) from err


def _membership_out(row: Membership) -> MembershipOut:
    plan_name = row.plan.name if row.plan is not None else None
    return MembershipOut(
        id=row.id,
        member_id=row.member_id,
        plan_id=row.plan_id,
        plan_name=plan_name,
        agreed_amount_toman=row.agreed_amount_toman,
        start_date=row.start_date,
        end_date=row.end_date,
        status=row.status,
        sessions_remaining=row.sessions_remaining,
        notes=row.notes,
        created_at=row.created_at,
    )


@router.get("/membership-plans", response_model=MembershipPlanListResponse)
def list_plans(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_DESK)),
) -> MembershipPlanListResponse:
    billing_svc.ensure_desk_staff(user)
    items = billing_svc.list_active_plans(db)
    return MembershipPlanListResponse(
        items=[MembershipPlanOut.model_validate(p) for p in items],
        total=len(items),
    )


@router.get("/members/{member_id}/memberships", response_model=MembershipListResponse)
def list_memberships(
    member_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_DESK)),
) -> MembershipListResponse:
    try:
        billing_svc.ensure_desk_staff(user)
        rows = billing_svc.list_member_memberships(db, member_id)
        debt = billing_svc.member_debt_toman(db, member_id)
    except billing_svc.BillingError as err:
        _raise(err)
        raise  # pragma: no cover
    return MembershipListResponse(
        items=[_membership_out(r) for r in rows],
        total=len(rows),
        debt_toman=debt,
    )


@router.post(
    "/members/{member_id}/memberships/renew",
    response_model=RenewMembershipResponse,
    status_code=status.HTTP_201_CREATED,
)
def renew_membership(
    member_id: int,
    body: RenewMembershipRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_DESK)),
) -> RenewMembershipResponse:
    try:
        result = billing_svc.renew_membership(
            db,
            user=user,
            member_id=member_id,
            plan_id=body.plan_id,
            agreed_amount_toman=body.agreed_amount_toman,
            base_membership_id=body.base_membership_id,
            notes=body.notes,
        )
        db.commit()
        db.refresh(result.membership)
        # reload plan for name
        _ = result.membership.plan
    except billing_svc.BillingError as err:
        db.rollback()
        _raise(err)
        raise  # pragma: no cover
    return RenewMembershipResponse(
        membership=_membership_out(result.membership),
        debt_toman=result.debt_toman,
        base_membership_id=result.base_membership_id,
    )


@router.post(
    "/memberships/{membership_id}/cancel",
    response_model=CancelMembershipResponse,
)
def cancel_membership(
    membership_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_DESK)),
) -> CancelMembershipResponse:
    try:
        row = billing_svc.cancel_membership(db, user=user, membership_id=membership_id)
        db.commit()
        db.refresh(row)
        _ = row.plan
    except billing_svc.BillingError as err:
        db.rollback()
        _raise(err)
        raise  # pragma: no cover
    return CancelMembershipResponse(membership=_membership_out(row))


@router.get("/members/{member_id}/payments", response_model=PaymentListResponse)
def list_payments(
    member_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_DESK)),
) -> PaymentListResponse:
    try:
        billing_svc.ensure_desk_staff(user)
        rows = billing_svc.list_member_payments(db, member_id)
        debt = billing_svc.member_debt_toman(db, member_id)
    except billing_svc.BillingError as err:
        _raise(err)
        raise  # pragma: no cover
    return PaymentListResponse(
        items=[PaymentOut.model_validate(p) for p in rows],
        total=len(rows),
        debt_toman=debt,
    )


@router.post(
    "/payments",
    response_model=PaymentMutationResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_payment(
    body: CreatePaymentRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_DESK)),
) -> PaymentMutationResponse:
    try:
        result = billing_svc.create_payment(
            db,
            user=user,
            member_id=body.member_id,
            amount_toman=body.amount_toman,
            method=body.method,
            membership_id=body.membership_id,
            status=body.status,
            title=body.title,
            note=body.note,
        )
        db.commit()
        db.refresh(result.payment)
    except billing_svc.BillingError as err:
        db.rollback()
        _raise(err)
        raise  # pragma: no cover
    return PaymentMutationResponse(
        payment=PaymentOut.model_validate(result.payment),
        debt_toman=result.debt_toman,
    )


@router.post(
    "/payments/{payment_id}/refund",
    response_model=PaymentMutationResponse,
)
def refund_payment(
    payment_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_DESK)),
) -> PaymentMutationResponse:
    try:
        result = billing_svc.refund_payment(db, user=user, payment_id=payment_id)
        db.commit()
        db.refresh(result.payment)
    except billing_svc.BillingError as err:
        db.rollback()
        _raise(err)
        raise  # pragma: no cover
    return PaymentMutationResponse(
        payment=PaymentOut.model_validate(result.payment),
        debt_toman=result.debt_toman,
    )
