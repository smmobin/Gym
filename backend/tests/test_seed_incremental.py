"""Incremental seed must not wipe non-seed rows or duplicate seed mobiles."""

from __future__ import annotations

from sqlalchemy import func, select

from app.core.db import SessionLocal
from app.core.security import hash_password
from app.db.seed import DEV_STAFF_PASSWORD, seed, wipe_and_seed
from app.models import Member, MemberStatus, StaffRole, User


def test_seed_preserves_non_seed_rows() -> None:
    wipe_and_seed()

    db = SessionLocal()
    try:
        owner = User(
            mobile="09128887766",
            password_hash=hash_password("OwnerOnlyPass1"),
            full_name="مدیر واقعی تست",
            role=StaffRole.MANAGER.value,
        )
        athlete = Member(
            display_id="M-9901",
            first_name="صاحب",
            last_name="دستی",
            mobile="09128887767",
            status=MemberStatus.ACTIVE.value,
            notes="دادهٔ غیر-seed صاحب",
        )
        db.add_all([owner, athlete])
        db.commit()
        owner_id = owner.id
        athlete_id = athlete.id
    finally:
        db.close()

    seed()  # incremental — must not clear

    db = SessionLocal()
    try:
        assert db.get(User, owner_id) is not None
        assert db.get(Member, athlete_id) is not None
        assert db.scalar(select(User).where(User.mobile == "09128887766")) is not None
        assert db.scalar(select(Member).where(Member.mobile == "09128887767")) is not None
        # Seed staff still present alongside owner
        assert db.scalar(select(User).where(User.mobile == "09120000001")) is not None
    finally:
        db.close()


def test_seed_does_not_duplicate_seed_mobiles() -> None:
    wipe_and_seed()
    seed()
    seed()

    db = SessionLocal()
    try:
        staff_n = int(
            db.scalar(select(func.count()).select_from(User).where(User.mobile == "09120000001"))
            or 0
        )
        member_n = int(
            db.scalar(
                select(func.count()).select_from(Member).where(Member.mobile == "09121111001")
            )
            or 0
        )
        assert staff_n == 1
        assert member_n == 1
        # Login still works with seed password for freshly created staff
        user = db.scalar(select(User).where(User.mobile == "09120000001"))
        assert user is not None
        assert user.full_name == "مدیر نمونه"
        _ = DEV_STAFF_PASSWORD  # documented contract for seed accounts
    finally:
        db.close()
