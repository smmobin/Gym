"""Membership renew + payments + refunds (append-only amounts)."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.enums import (
    MemberStatus,
    MembershipStatus,
    PaymentMethod,
    PaymentStatus,
    StaffRole,
)
from app.models.member import Member
from app.models.membership import Membership, MembershipPlan
from app.models.payment import Payment
from app.models.user import User
from app.services.audit import write_audit
from app.services.debt import member_debt

_RECEIPT_RE = re.compile(r"^R-(\d+)$", re.IGNORECASE)
_RECEIPT_START = 1001

_OPEN_FOR_BASE = {
    MembershipStatus.PENDING.value,
    MembershipStatus.ACTIVE.value,
    MembershipStatus.FROZEN.value,
    MembershipStatus.EXPIRED.value,
}

_PAYMENT_METHODS = {m.value for m in PaymentMethod}
_PAYMENT_STATUSES_CREATE = {PaymentStatus.PAID.value, PaymentStatus.PENDING.value}


class BillingError(Exception):
    def __init__(self, status_code: int, detail: str, *, code: str | None = None) -> None:
        self.status_code = status_code
        self.detail = detail
        self.code = code
        super().__init__(detail)


@dataclass
class RenewResult:
    membership: Membership
    debt_toman: int
    base_membership_id: int | None


@dataclass
class PaymentResult:
    payment: Payment
    debt_toman: int


def today_tehran() -> date:
    from zoneinfo import ZoneInfo

    return datetime.now(tz=ZoneInfo("Asia/Tehran")).date()


def next_receipt_number(db: Session) -> str:
    """Sequential readable receipts: R-1001, R-1002, … (continues from max existing)."""
    rows = db.scalars(select(Payment.receipt_number)).all()
    max_n = _RECEIPT_START - 1
    for value in rows:
        match = _RECEIPT_RE.match(value or "")
        if match:
            max_n = max(max_n, int(match.group(1)))
    return f"R-{max_n + 1}"


def ensure_desk_staff(user: User) -> None:
    if user.role not in {StaffRole.MANAGER.value, StaffRole.RECEPTIONIST.value}:
        raise BillingError(403, "دسترسی مجاز نیست.")


def load_member(db: Session, member_id: int) -> Member:
    member = db.get(Member, member_id)
    if member is None:
        raise BillingError(404, "عضو یافت نشد.")
    if member.status == MemberStatus.ARCHIVED.value:
        raise BillingError(409, "عضو آرشیو شده است.")
    return member


def member_debt_toman(db: Session, member_id: int) -> int:
    memberships = list(
        db.scalars(select(Membership).where(Membership.member_id == member_id)).all()
    )
    payments = list(db.scalars(select(Payment).where(Payment.member_id == member_id)).all())
    return member_debt(memberships, payments).debt_toman


def list_active_plans(db: Session) -> list[MembershipPlan]:
    return list(
        db.scalars(
            select(MembershipPlan)
            .where(MembershipPlan.is_active.is_(True))
            .order_by(MembershipPlan.id.asc())
        ).all()
    )


def list_member_memberships(db: Session, member_id: int) -> list[Membership]:
    load_member(db, member_id)
    return list(
        db.scalars(
            select(Membership)
            .options(joinedload(Membership.plan))
            .where(Membership.member_id == member_id)
            .order_by(Membership.start_date.desc(), Membership.id.desc())
        )
        .unique()
        .all()
    )


def list_member_payments(db: Session, member_id: int) -> list[Payment]:
    load_member(db, member_id)
    return list(
        db.scalars(
            select(Payment)
            .where(Payment.member_id == member_id)
            .order_by(Payment.created_at.desc(), Payment.id.desc())
        ).all()
    )


def _pick_base_membership(
    db: Session,
    *,
    member_id: int,
    base_membership_id: int | None,
) -> Membership | None:
    if base_membership_id is not None:
        base = db.get(Membership, base_membership_id)
        if base is None or base.member_id != member_id:
            raise BillingError(404, "اشتراک مرجع یافت نشد.")
        if base.status == MembershipStatus.CANCELLED.value:
            raise BillingError(409, "اشتراک لغوشده نمی‌تواند مبنای تمدید باشد.")
        return base

    rows = list(
        db.scalars(
            select(Membership)
            .where(
                Membership.member_id == member_id,
                Membership.status.in_(_OPEN_FOR_BASE),
            )
            .order_by(Membership.end_date.desc(), Membership.id.desc())
        ).all()
    )
    return rows[0] if rows else None


def renew_start_date(*, base: Membership | None, today: date) -> date:
    """
    Renewal start policy (documented in getting-started):
    - with valid/not-yet-ended base: start_date = base.end_date (remaining day is not burned)
    - with already-expired base (end_date < today): start_date = today (full new period)
    - no base: start_date = today
    """
    if base is None:
        return today
    if base.end_date >= today:
        return base.end_date
    return today


def compute_end_date(plan: MembershipPlan, start: date) -> date:
    if plan.duration_days is not None:
        return start + timedelta(days=plan.duration_days)
    # session-only plan without duration: 60-day window
    return start + timedelta(days=60)


def renew_membership(
    db: Session,
    *,
    user: User | None = None,
    member_id: int,
    plan_id: int,
    agreed_amount_toman: int,
    base_membership_id: int | None = None,
    notes: str | None = None,
    require_desk: bool = True,
    audit_action: str = "membership.renew",
) -> RenewResult:
    """
    Create a renewal membership using renew_start_date / compute_end_date.

    Desk path: require_desk=True (default) and a staff user.
    Online gateway path: require_desk=False after server-side verify (no staff actor).
    """
    if require_desk:
        if user is None:
            raise BillingError(403, "دسترسی مجاز نیست.")
        ensure_desk_staff(user)
    if agreed_amount_toman < 0:
        raise BillingError(422, "مبلغ توافقی نمی‌تواند منفی باشد.")

    member = load_member(db, member_id)
    plan = db.get(MembershipPlan, plan_id)
    if plan is None or not plan.is_active:
        raise BillingError(404, "طرح فعال یافت نشد.")

    today = today_tehran()
    base = _pick_base_membership(db, member_id=member.id, base_membership_id=base_membership_id)
    start = renew_start_date(base=base, today=today)
    end = compute_end_date(plan, start)

    if end < start:
        raise BillingError(422, "بازهٔ عضویت نامعتبر است.")

    status = (
        MembershipStatus.ACTIVE.value
        if start <= today <= end
        else MembershipStatus.PENDING.value
    )
    sessions_remaining = plan.session_count

    row = Membership(
        member_id=member.id,
        plan_id=plan.id,
        agreed_amount_toman=agreed_amount_toman,
        start_date=start,
        end_date=end,
        status=status,
        sessions_remaining=sessions_remaining,
        notes=notes,
    )
    db.add(row)
    db.flush()

    if member.status == MemberStatus.PENDING.value and status == MembershipStatus.ACTIVE.value:
        member.status = MemberStatus.ACTIVE.value

    write_audit(
        db,
        actor_user_id=user.id if user is not None else None,
        action=audit_action,
        entity_type="membership",
        entity_id=row.id,
        summary=f"تمدید عضویت عضو {member.display_id} با طرح {plan.name}",
        payload={
            "member_id": member.id,
            "plan_id": plan.id,
            "agreed_amount_toman": agreed_amount_toman,
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            "base_membership_id": base.id if base else None,
            "status": status,
            "via_gateway": not require_desk,
        },
    )

    return RenewResult(
        membership=row,
        debt_toman=member_debt_toman(db, member.id),
        base_membership_id=base.id if base else None,
    )


def cancel_membership(
    db: Session,
    *,
    user: User,
    membership_id: int,
) -> Membership:
    ensure_desk_staff(user)
    row = db.get(Membership, membership_id)
    if row is None:
        raise BillingError(404, "عضویت یافت نشد.")
    if row.status == MembershipStatus.CANCELLED.value:
        raise BillingError(409, "این عضویت قبلاً لغو شده است.")

    today = today_tehran()
    row.status = MembershipStatus.CANCELLED.value
    if row.end_date > today:
        row.end_date = today
    db.flush()

    write_audit(
        db,
        actor_user_id=user.id,
        action="membership.cancel",
        entity_type="membership",
        entity_id=row.id,
        summary=f"لغو عضویت #{row.id} از امروز",
        payload={"member_id": row.member_id, "end_date": row.end_date.isoformat()},
    )
    return row


def create_payment(
    db: Session,
    *,
    user: User,
    member_id: int,
    amount_toman: int,
    method: str,
    membership_id: int | None = None,
    status: str = PaymentStatus.PAID.value,
    title: str | None = None,
    note: str | None = None,
) -> PaymentResult:
    ensure_desk_staff(user)
    if amount_toman < 0:
        raise BillingError(422, "مبلغ پرداخت نمی‌تواند منفی باشد.")
    if method not in _PAYMENT_METHODS:
        raise BillingError(422, "روش پرداخت نامعتبر است.")
    if status not in _PAYMENT_STATUSES_CREATE:
        raise BillingError(422, "وضعیت پرداخت نامعتبر است.")

    member = load_member(db, member_id)
    if membership_id is not None:
        membership = db.get(Membership, membership_id)
        if membership is None or membership.member_id != member.id:
            raise BillingError(404, "عضویت مرتبط یافت نشد.")

    now = datetime.now(tz=timezone.utc)
    receipt = next_receipt_number(db)
    paid_at = now if status == PaymentStatus.PAID.value else None

    payment = Payment(
        member_id=member.id,
        membership_id=membership_id,
        amount_toman=amount_toman,
        method=method,
        status=status,
        receipt_number=receipt,
        title=title,
        note=note,
        paid_at=paid_at,
        created_by_user_id=user.id,
    )
    db.add(payment)
    db.flush()

    write_audit(
        db,
        actor_user_id=user.id,
        action="payment.create",
        entity_type="payment",
        entity_id=payment.id,
        summary=f"ثبت پرداخت {receipt} برای {member.display_id}",
        payload={
            "member_id": member.id,
            "membership_id": membership_id,
            "amount_toman": amount_toman,
            "method": method,
            "status": status,
            "receipt_number": receipt,
        },
    )

    return PaymentResult(payment=payment, debt_toman=member_debt_toman(db, member.id))


def refund_payment(
    db: Session,
    *,
    user: User,
    payment_id: int,
) -> PaymentResult:
    ensure_desk_staff(user)
    payment = db.get(Payment, payment_id)
    if payment is None:
        raise BillingError(404, "پرداخت یافت نشد.")
    if payment.status == PaymentStatus.REFUNDED.value:
        raise BillingError(409, "این پرداخت قبلاً برگشت خورده است.")
    if payment.status != PaymentStatus.PAID.value:
        raise BillingError(409, "فقط پرداخت‌های paid قابل برگشت هستند.")

    original_amount = payment.amount_toman
    payment.mark_refunded(at=datetime.now(tz=timezone.utc))
    db.flush()

    # Invariant: amount must not change on refund
    if payment.amount_toman != original_amount:
        raise BillingError(500, "مبلغ پرداخت نباید تغییر کند.")

    write_audit(
        db,
        actor_user_id=user.id,
        action="payment.refund",
        entity_type="payment",
        entity_id=payment.id,
        summary=f"برگشت پرداخت {payment.receipt_number}",
        payload={
            "member_id": payment.member_id,
            "amount_toman": payment.amount_toman,
            "receipt_number": payment.receipt_number,
            "previous_status": PaymentStatus.PAID.value,
        },
    )

    return PaymentResult(
        payment=payment,
        debt_toman=member_debt_toman(db, payment.member_id),
    )
