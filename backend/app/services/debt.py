"""Debt helpers: debt = agreed membership amounts − paid payments (income ≠ debt)."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

from app.models.enums import MembershipStatus, PaymentStatus
from app.models.membership import Membership
from app.models.payment import Payment

# Memberships that still count toward outstanding obligation.
_OPEN_MEMBERSHIP_STATUSES = {
    MembershipStatus.PENDING.value,
    MembershipStatus.ACTIVE.value,
    MembershipStatus.FROZEN.value,
    MembershipStatus.EXPIRED.value,
}


@dataclass(frozen=True)
class MemberDebtSummary:
    member_id: int
    agreed_total_toman: int
    paid_total_toman: int
    debt_toman: int


def membership_counts_toward_debt(membership: Membership) -> bool:
    """Cancelled memberships drop out of debt; expired still may carry unpaid agreed amount."""
    return membership.status in _OPEN_MEMBERSHIP_STATUSES


def sum_agreed_toman(memberships: Iterable[Membership]) -> int:
    return sum(m.agreed_amount_toman for m in memberships if membership_counts_toward_debt(m))


def sum_paid_toman(payments: Iterable[Payment], *, membership_ids: set[int] | None = None) -> int:
    total = 0
    for payment in payments:
        if payment.status != PaymentStatus.PAID.value:
            continue
        if membership_ids is not None:
            if payment.membership_id is None or payment.membership_id not in membership_ids:
                continue
        total += payment.amount_toman
    return total


def member_debt(
    memberships: Iterable[Membership],
    payments: Iterable[Payment],
) -> MemberDebtSummary:
    """
    Dashboard-safe debt for one member.

    Income reports should use paid totals only; this debt figure is separate.
    """
    membership_list = list(memberships)
    if not membership_list:
        member_id = 0
    else:
        member_id = membership_list[0].member_id

    open_ids = {m.id for m in membership_list if membership_counts_toward_debt(m)}
    agreed = sum_agreed_toman(membership_list)
    paid = sum_paid_toman(payments, membership_ids=open_ids if open_ids else set())
    debt = max(agreed - paid, 0)
    return MemberDebtSummary(
        member_id=member_id,
        agreed_total_toman=agreed,
        paid_total_toman=paid,
        debt_toman=debt,
    )
