"""DB constraints and debt rules for v1 schema."""

from __future__ import annotations

from datetime import date, timedelta

import pytest
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.db import SessionLocal, engine
from app.models import (
    Member,
    MemberStatus,
    Membership,
    MembershipPlan,
    MembershipStatus,
    Payment,
    PaymentMethod,
    PaymentStatus,
)
from app.services.debt import member_debt


@pytest.fixture
def db() -> Session:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


def test_expected_tables_exist_after_migration() -> None:
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    expected = {
        "users",
        "members",
        "membership_plans",
        "memberships",
        "payments",
        "attendances",
        "gym_settings",
        "audit_logs",
        "group_classes",
        "class_bookings",
        "lockers",
        "locker_assignments",
        "trainer_member_assignments",
        "workout_plans",
        "trial_leads",
        "expenses",
        "staff_sessions",
        "member_file_locks",
        "staff_notifications",
        "staff_notification_reads",
        "athlete_sessions",
        "athlete_notifications",
        "login_otps",
        "alembic_version",
    }
    missing = expected - tables
    assert not missing, f"Missing tables: {sorted(missing)}"


def test_alembic_current_revision() -> None:
    with engine.connect() as conn:
        rev = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
    # Head may advance; must be a known applied revision (not empty).
    assert rev in {
        "2ac5732e2cdb",
        "d4d03f2d4572",
        "a1b2c3d4e5f6",
        "b2c3d4e5f6a7",
        "c3d4e5f6a7b8",
        "e5f6a7b8c9d0",
        "f6a7b8c9d0e1",
    }


def test_member_mobile_unique(db: Session) -> None:
    suffix = "x"  # stable enough inside rolled-back txn
    m1 = Member(
        display_id="M-T901",
        first_name="تست",
        last_name="یک",
        mobile="09128888001",
        status=MemberStatus.ACTIVE.value,
    )
    m2 = Member(
        display_id="M-T902",
        first_name="تست",
        last_name="دو",
        mobile="09128888001",
        status=MemberStatus.ACTIVE.value,
    )
    db.add(m1)
    db.flush()
    db.add(m2)
    with pytest.raises(IntegrityError):
        db.flush()
    db.rollback()
    _ = suffix


def test_agreed_amount_cannot_be_negative(db: Session) -> None:
    plan = MembershipPlan(
        name="تست منفی",
        duration_days=30,
        base_price_toman=1000,
        includes_locker=False,
        is_active=True,
    )
    member = Member(
        display_id="M-T903",
        first_name="تست",
        last_name="منفی",
        mobile="09128888003",
        status=MemberStatus.ACTIVE.value,
    )
    db.add_all([plan, member])
    db.flush()
    bad = Membership(
        member_id=member.id,
        plan_id=plan.id,
        agreed_amount_toman=-1,
        start_date=date.today(),
        end_date=date.today() + timedelta(days=30),
        status=MembershipStatus.ACTIVE.value,
    )
    db.add(bad)
    with pytest.raises(IntegrityError):
        db.flush()
    db.rollback()


def test_zero_agreed_amount_allowed(db: Session) -> None:
    plan = MembershipPlan(
        name="تست صفر",
        duration_days=30,
        base_price_toman=0,
        includes_locker=False,
        is_active=True,
    )
    member = Member(
        display_id="M-T904",
        first_name="تست",
        last_name="صفر",
        mobile="09128888004",
        status=MemberStatus.ACTIVE.value,
    )
    db.add_all([plan, member])
    db.flush()
    gift = Membership(
        member_id=member.id,
        plan_id=plan.id,
        agreed_amount_toman=0,
        start_date=date.today(),
        end_date=date.today() + timedelta(days=30),
        status=MembershipStatus.ACTIVE.value,
    )
    db.add(gift)
    db.flush()
    assert gift.id is not None
    db.rollback()


def test_debt_equals_agreed_minus_paid() -> None:
    memberships = [
        Membership(
            id=1,
            member_id=10,
            plan_id=1,
            agreed_amount_toman=1_500_000,
            start_date=date.today(),
            end_date=date.today() + timedelta(days=30),
            status=MembershipStatus.ACTIVE.value,
        ),
        Membership(
            id=2,
            member_id=10,
            plan_id=1,
            agreed_amount_toman=3_600_000,
            start_date=date.today(),
            end_date=date.today() + timedelta(days=60),
            status=MembershipStatus.ACTIVE.value,
        ),
    ]
    payments = [
        Payment(
            id=1,
            member_id=10,
            membership_id=1,
            amount_toman=1_500_000,
            method=PaymentMethod.CASH.value,
            status=PaymentStatus.PAID.value,
            receipt_number="R-TEST-1",
        ),
        Payment(
            id=2,
            member_id=10,
            membership_id=2,
            amount_toman=1_000_000,
            method=PaymentMethod.CASH.value,
            status=PaymentStatus.PAID.value,
            receipt_number="R-TEST-2",
        ),
        Payment(
            id=3,
            member_id=10,
            membership_id=2,
            amount_toman=500_000,
            method=PaymentMethod.CASH.value,
            status=PaymentStatus.PENDING.value,
            receipt_number="R-TEST-3",
        ),
    ]
    summary = member_debt(memberships, payments)
    assert summary.agreed_total_toman == 5_100_000
    assert summary.paid_total_toman == 2_500_000
    assert summary.debt_toman == 2_600_000
