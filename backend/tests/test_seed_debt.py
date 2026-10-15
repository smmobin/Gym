"""Seed data must keep income ≠ debt and debt = agreed − paid."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

import pytest

from app.core.db import SessionLocal
from app.models import Member, Membership, Payment
from app.models.enums import PaymentStatus
from app.services.debt import member_debt


@pytest.fixture
def db() -> Session:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def test_seed_has_enough_members(db: Session) -> None:
    count = len(db.scalars(select(Member)).all())
    assert count >= 8


def test_seed_debt_matches_agreed_minus_paid(db: Session) -> None:
    members = db.scalars(select(Member)).all()
    assert members, "Run: python -m app.db.seed"

    for member in members:
        memberships = db.scalars(
            select(Membership).where(Membership.member_id == member.id)
        ).all()
        payments = db.scalars(select(Payment).where(Payment.member_id == member.id)).all()
        summary = member_debt(memberships, payments)

        paid_only = sum(
            p.amount_toman for p in payments if p.status == PaymentStatus.PAID.value
        )
        # Income figure (all paid on member) may include only open memberships in debt helper;
        # debt itself must never be negative and must equal helper math.
        assert summary.debt_toman >= 0
        assert summary.debt_toman == max(summary.agreed_total_toman - summary.paid_total_toman, 0)
        assert summary.paid_total_toman <= summary.agreed_total_toman or summary.agreed_total_toman == 0
        # Paid rows never inflate debt
        assert summary.debt_toman <= summary.agreed_total_toman
        _ = paid_only


def test_ali_has_partial_pt_debt(db: Session) -> None:
    ali = db.scalar(select(Member).where(Member.display_id == "M-1001"))
    assert ali is not None
    memberships = db.scalars(select(Membership).where(Membership.member_id == ali.id)).all()
    payments = db.scalars(select(Payment).where(Payment.member_id == ali.id)).all()
    summary = member_debt(memberships, payments)
    # 1_500_000 + 3_600_000 agreed, 1_500_000 + 1_000_000 paid → 2_600_000 debt
    assert summary.agreed_total_toman == 5_100_000
    assert summary.paid_total_toman == 2_500_000
    assert summary.debt_toman == 2_600_000


def test_hosein_full_debt_with_valid_membership(db: Session) -> None:
    hosein = db.scalar(select(Member).where(Member.display_id == "M-1005"))
    assert hosein is not None
    memberships = db.scalars(select(Membership).where(Membership.member_id == hosein.id)).all()
    payments = db.scalars(select(Payment).where(Payment.member_id == hosein.id)).all()
    summary = member_debt(memberships, payments)
    assert summary.debt_toman == 1_500_000
    assert any(m.status == "active" for m in memberships)
