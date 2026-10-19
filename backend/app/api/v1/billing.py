"""Membership plans, renew, payments, refunds."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.db import get_db
from app.models.enums import StaffRole
from app.models.membership import Membership
from app.models.payment import Payment
from app.models.user import User
from app.schemas.billing import (
    CancelMembershipResponse,
    CreatePaymentRequest,
    FreezeMembershipRequest,
    FreezeMembershipResponse,
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
from app.services import member_locks as lock_svc
from app.services import membership_freeze as freeze_svc

router = APIRouter(tags=["billing"])

_DESK = (StaffRole.MANAGER.value, StaffRole.RECEPTIONIST.value)


def _raise(err: billing_svc.BillingError) -> None:
    raise HTTPException(status_code=err.status_code, detail=err.detail) from err


def _raise_lock(err: lock_svc.MemberLockError) -> None:
    raise HTTPException(status_code=err.status_code, detail=err.detail) from err


def _enforce_member_lock(db: Session, user: User, member_id: int) -> None:
    try:
        lock_svc.assert_not_locked_by_other(db, user=user, member_id=member_id)
    except lock_svc.MemberLockError as err:
        _raise_lock(err)
        raise  # pragma: no cover


def _membership_out(
    row: Membership,
    *,
    remaining_freeze_days_this_year: int = 0,
) -> MembershipOut:
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
        freeze_started_at=row.freeze_started_at,
        freeze_ends_at=row.freeze_ends_at,
        freeze_days_used=int(row.freeze_days_used or 0),
        remaining_freeze_days_this_year=remaining_freeze_days_this_year,
        notes=row.notes,
        created_at=row.created_at,
    )


def _raise_freeze(err: freeze_svc.FreezeError) -> None:
    raise HTTPException(status_code=err.status_code, detail=err.detail) from err


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
        freeze_svc.complete_due_freezes_for_member(db, member_id)
        db.commit()
        rows = billing_svc.list_member_memberships(db, member_id)
        debt = billing_svc.member_debt_toman(db, member_id)
        cap = freeze_svc.freeze_cap_info(db, member_id)
    except billing_svc.BillingError as err:
        db.rollback()
        _raise(err)
        raise  # pragma: no cover
    return MembershipListResponse(
        items=[
            _membership_out(r, remaining_freeze_days_this_year=cap.remaining_days)
            for r in rows
        ],
        total=len(rows),
        debt_toman=debt,
        freeze_annual_cap_days=cap.cap_days,
        freeze_days_used_member=cap.used_days,
        remaining_freeze_days_this_year=cap.remaining_days,
        freeze_cap_year=cap.cap_year,
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
    _enforce_member_lock(db, user, member_id)
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
        cap = freeze_svc.freeze_cap_info(db, row.member_id)
    except billing_svc.BillingError as err:
        db.rollback()
        _raise(err)
        raise  # pragma: no cover
    return CancelMembershipResponse(
        membership=_membership_out(row, remaining_freeze_days_this_year=cap.remaining_days)
    )


@router.post(
    "/memberships/{membership_id}/freeze",
    response_model=FreezeMembershipResponse,
)
def freeze_membership(
    membership_id: int,
    body: FreezeMembershipRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_DESK)),
) -> FreezeMembershipResponse:
    membership = db.get(Membership, membership_id)
    if membership is not None:
        _enforce_member_lock(db, user, membership.member_id)
    try:
        row = freeze_svc.freeze_membership(
            db,
            user=user,
            membership_id=membership_id,
            days=body.days,
            freeze_ends_at=body.freeze_ends_at,
        )
        db.commit()
        row = freeze_svc.load_membership_with_plan(db, row.id)
        cap = freeze_svc.freeze_cap_info(db, row.member_id)
    except freeze_svc.FreezeError as err:
        db.rollback()
        _raise_freeze(err)
        raise  # pragma: no cover
    return FreezeMembershipResponse(
        membership=_membership_out(row, remaining_freeze_days_this_year=cap.remaining_days),
        remaining_freeze_days_this_year=cap.remaining_days,
    )


@router.post(
    "/memberships/{membership_id}/unfreeze",
    response_model=FreezeMembershipResponse,
)
def unfreeze_membership(
    membership_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_DESK)),
) -> FreezeMembershipResponse:
    membership = db.get(Membership, membership_id)
    if membership is not None:
        _enforce_member_lock(db, user, membership.member_id)
    try:
        row = freeze_svc.unfreeze_membership(
            db, user=user, membership_id=membership_id
        )
        db.commit()
        row = freeze_svc.load_membership_with_plan(db, row.id)
        cap = freeze_svc.freeze_cap_info(db, row.member_id)
    except freeze_svc.FreezeError as err:
        db.rollback()
        _raise_freeze(err)
        raise  # pragma: no cover
    return FreezeMembershipResponse(
        membership=_membership_out(row, remaining_freeze_days_this_year=cap.remaining_days),
        remaining_freeze_days_this_year=cap.remaining_days,
    )


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
    _enforce_member_lock(db, user, body.member_id)
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
    payment = db.get(Payment, payment_id)
    if payment is not None:
        _enforce_member_lock(db, user, payment.member_id)
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
