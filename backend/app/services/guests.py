"""Day-guest registration: temporary member + 1-day plan membership (+ optional payment).

Duplicate mobile policy (v1):
- New mobile → create Member (active) + 1-day membership.
- Existing mobile → reuse that Member; add a new 1-day membership (no 409).
  Name fields from the form are not rewritten on existing members.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

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
from app.services.billing import next_receipt_number, today_tehran
from app.services.members import member_by_mobile, next_display_id

GUEST_PLAN_NAME = "مهمان یک‌روزه"
_PAYMENT_METHODS = {m.value for m in PaymentMethod}


class GuestError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


@dataclass
class DayGuestResult:
    member: Member
    membership: Membership
    payment: Payment | None
    reused_existing_member: bool


def ensure_desk(user: User) -> None:
    if user.role not in {StaffRole.MANAGER.value, StaffRole.RECEPTIONIST.value}:
        raise GuestError(403, "دسترسی مجاز نیست.")


def find_guest_day_plan(db: Session) -> MembershipPlan:
    """Require the seeded guest plan; do not silently invent one."""
    plan = db.scalar(
        select(MembershipPlan).where(
            MembershipPlan.is_active.is_(True),
            MembershipPlan.name == GUEST_PLAN_NAME,
            MembershipPlan.duration_days == 1,
        )
    )
    if plan is None:
        plan = db.scalar(
            select(MembershipPlan).where(
                MembershipPlan.is_active.is_(True),
                MembershipPlan.duration_days == 1,
                MembershipPlan.name.ilike("%مهمان%"),
            )
        )
    if plan is None:
        raise GuestError(
            404,
            f'طرح «{GUEST_PLAN_NAME}» (duration_days=1) یافت نشد. seed را اجرا کنید.',
        )
    return plan


def register_day_guest(
    db: Session,
    *,
    user: User,
    first_name: str,
    last_name: str,
    mobile: str,
    agreed_amount_toman: int,
    payment_method: str = PaymentMethod.CASH.value,
    pay_now: bool = True,
    notes: str | None = None,
) -> DayGuestResult:
    ensure_desk(user)
    if agreed_amount_toman < 0:
        raise GuestError(422, "مبلغ توافقی نمی‌تواند منفی باشد.")
    if payment_method not in _PAYMENT_METHODS:
        raise GuestError(422, "روش پرداخت نامعتبر است.")

    plan = find_guest_day_plan(db)
    today = today_tehran()
    duration = plan.duration_days or 1
    # duration_days=1 → start_date == end_date == today Tehran
    end_date = today + timedelta(days=max(duration, 1) - 1)

    existing = member_by_mobile(db, mobile)
    reused = existing is not None
    if existing is not None:
        member = existing
        if member.status == MemberStatus.ARCHIVED.value:
            raise GuestError(409, "این موبایل متعلق به عضو آرشیو است؛ اول از آرشیو خارج کنید.")
        if member.status != MemberStatus.ACTIVE.value:
            member.status = MemberStatus.ACTIVE.value
    else:
        member = Member(
            display_id=next_display_id(db),
            first_name=first_name,
            last_name=last_name,
            mobile=mobile,
            notes=notes or "مهمان روزانه",
            status=MemberStatus.ACTIVE.value,
        )
        db.add(member)
        db.flush()

    membership = Membership(
        member_id=member.id,
        plan_id=plan.id,
        agreed_amount_toman=agreed_amount_toman,
        start_date=today,
        end_date=end_date,
        status=MembershipStatus.ACTIVE.value,
        notes="مهمان روزانه",
    )
    db.add(membership)
    db.flush()

    payment: Payment | None = None
    if pay_now:
        now = datetime.now(tz=timezone.utc)
        payment = Payment(
            member_id=member.id,
            membership_id=membership.id,
            amount_toman=agreed_amount_toman,
            method=payment_method,
            status=PaymentStatus.PAID.value,
            receipt_number=next_receipt_number(db),
            title="مهمان روزانه",
            paid_at=now,
            created_by_user_id=user.id,
        )
        db.add(payment)
        db.flush()

    write_audit(
        db,
        actor_user_id=user.id,
        action="guest.day_register",
        entity_type="member",
        entity_id=member.id,
        summary=f"ثبت مهمان روزانه {member.display_id}",
        payload={
            "membership_id": membership.id,
            "payment_id": payment.id if payment else None,
            "reused_existing_member": reused,
            "agreed_amount_toman": agreed_amount_toman,
        },
    )

    # ensure plan name available
    _ = membership.plan
    return DayGuestResult(
        member=member,
        membership=membership,
        payment=payment,
        reused_existing_member=reused,
    )
