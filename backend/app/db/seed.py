"""
Fake development seed for GYM CONTROL.

Run from backend/:
  .\\.venv\\Scripts\\python.exe -m app.db.seed

Idempotent: clears seed-tagged domain tables then reloads (dev only).
Never put real member PII here.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.db import SessionLocal, engine
from app.core.security import hash_password
from app.models import (
    Attendance,
    AttendanceType,
    AuditLog,
    BookingStatus,
    ClassBooking,
    Expense,
    ExpenseCategory,
    GenderLabel,
    GroupClass,
    GymSettings,
    Locker,
    LockerAssignment,
    Member,
    MemberStatus,
    Membership,
    MembershipPlan,
    MembershipStatus,
    Payment,
    PaymentMethod,
    PaymentStatus,
    StaffRole,
    StaffSession,
    TrainerMemberAssignment,
    TrialLead,
    TrialLeadStatus,
    User,
    WorkoutPlan,
)
from app.services.debt import member_debt

UTC = timezone.utc

# Dev-only shared password for seed staff accounts (NOT a real gym password).
DEV_STAFF_PASSWORD = "ChangeMe123"


def _clear_domain(session: Session) -> None:
    """Wipe domain tables in FK-safe order (dev reset)."""
    for model in (
        ClassBooking,
        GroupClass,
        LockerAssignment,
        Locker,
        TrainerMemberAssignment,
        WorkoutPlan,
        Attendance,
        Payment,
        Membership,
        MembershipPlan,
        Expense,
        TrialLead,
        AuditLog,
        StaffSession,
        Member,
        GymSettings,
        User,
    ):
        session.execute(delete(model))
    session.commit()


def seed(session: Session | None = None) -> dict[str, int]:
    own_session = session is None
    session = session or SessionLocal()
    try:
        _clear_domain(session)
        today = date.today()
        now = datetime.now(tz=UTC)

        staff_password_hash = hash_password(DEV_STAFF_PASSWORD)
        manager = User(
            mobile="09120000001",
            password_hash=staff_password_hash,
            full_name="مدیر نمونه",
            role=StaffRole.MANAGER.value,
        )
        receptionist = User(
            mobile="09120000002",
            password_hash=staff_password_hash,
            full_name="منشی نمونه",
            role=StaffRole.RECEPTIONIST.value,
        )
        trainer1 = User(
            mobile="09120000003",
            password_hash=staff_password_hash,
            full_name="مربی یک",
            role=StaffRole.TRAINER.value,
        )
        trainer2 = User(
            mobile="09120000004",
            password_hash=staff_password_hash,
            full_name="مربی دو",
            role=StaffRole.TRAINER.value,
        )
        session.add_all([manager, receptionist, trainer1, trainer2])
        session.flush()

        settings = GymSettings(
            gym_name="باشگاه آذر",
            phone="021-12345678",
            address="تهران، خیابان نمونه، پلاک ۱",
            day_end_time=time(23, 0),
            expiry_warning_days=7,
            freeze_annual_cap_days=14,
            working_hours_note="۶ تا ۲۳",
            renewal_rules_note="تمدید از پایان اشتراک فعلی",
        )
        session.add(settings)

        plans = [
            MembershipPlan(
                name="ماهانه سالن",
                description="۳۰ روز دسترسی سالن",
                duration_days=30,
                session_count=None,
                base_price_toman=1_500_000,
                includes_locker=False,
                is_active=True,
            ),
            MembershipPlan(
                name="سه‌ماهه + کمد",
                description="۹۰ روز با کمد",
                duration_days=90,
                session_count=None,
                base_price_toman=4_000_000,
                includes_locker=True,
                is_active=True,
            ),
            MembershipPlan(
                name="۱۲ جلسه مربی",
                description="بسته جلسه خصوصی",
                duration_days=60,
                session_count=12,
                base_price_toman=3_600_000,
                includes_locker=False,
                is_active=True,
            ),
            MembershipPlan(
                name="۸ جلسه کلاس گروهی",
                description="بسته کلاس",
                duration_days=45,
                session_count=8,
                base_price_toman=1_200_000,
                includes_locker=False,
                is_active=True,
            ),
            MembershipPlan(
                name="مهمان یک‌روزه",
                description="عضویت موقت روزانه",
                duration_days=1,
                session_count=None,
                base_price_toman=250_000,
                includes_locker=False,
                is_active=True,
            ),
        ]
        session.add_all(plans)
        session.flush()
        plan_month, plan_quarter, plan_pt, plan_class, plan_guest = plans

        member_specs = [
            # display, first, last, mobile, status, memberships..., note
            ("M-1001", "علی", "رضایی", "09121111001", MemberStatus.ACTIVE),
            ("M-1002", "سارا", "محمدی", "09121111002", MemberStatus.ACTIVE),
            ("M-1003", "محمد", "کریمی", "09121111003", MemberStatus.ACTIVE),
            ("M-1004", "نگار", "احمدی", "09121111004", MemberStatus.ACTIVE),
            ("M-1005", "حسین", "موسوی", "09121111005", MemberStatus.ACTIVE),
            ("M-1006", "مریم", "جعفری", "09121111006", MemberStatus.ACTIVE),
            ("M-1007", "رضا", "نوری", "09121111007", MemberStatus.PENDING),
            ("M-1008", "الهام", "کاظمی", "09121111008", MemberStatus.ACTIVE),
            ("M-1009", "مهمان", "روزانه", "09121111009", MemberStatus.ACTIVE),
        ]
        members: list[Member] = []
        for display_id, first, last, mobile, status in member_specs:
            m = Member(
                display_id=display_id,
                first_name=first,
                last_name=last,
                mobile=mobile,
                status=status.value,
                notes="دادهٔ ساختگی seed",
            )
            members.append(m)
        session.add_all(members)
        session.flush()
        (
            ali,
            sara,
            mohammad,
            negar,
            hosein,
            maryam,
            reza,
            elham,
            guest,
        ) = members

        # Memberships: active / near-expiry / expired / debt / paid / zero gift / guest day
        m_ali = Membership(
            member_id=ali.id,
            plan_id=plan_month.id,
            agreed_amount_toman=1_500_000,
            start_date=today - timedelta(days=10),
            end_date=today + timedelta(days=20),
            status=MembershipStatus.ACTIVE.value,
        )
        m_sara = Membership(
            member_id=sara.id,
            plan_id=plan_quarter.id,
            agreed_amount_toman=3_800_000,  # discount vs base
            start_date=today - timedelta(days=80),
            end_date=today + timedelta(days=5),  # near expiry (<7)
            status=MembershipStatus.ACTIVE.value,
        )
        m_mohammad = Membership(
            member_id=mohammad.id,
            plan_id=plan_month.id,
            agreed_amount_toman=1_500_000,
            start_date=today - timedelta(days=40),
            end_date=today - timedelta(days=5),
            status=MembershipStatus.EXPIRED.value,
        )
        m_negar = Membership(
            member_id=negar.id,
            plan_id=plan_pt.id,
            agreed_amount_toman=3_600_000,
            start_date=today - timedelta(days=5),
            end_date=today + timedelta(days=55),
            status=MembershipStatus.ACTIVE.value,
            sessions_remaining=10,
        )
        m_hosein = Membership(
            member_id=hosein.id,
            plan_id=plan_month.id,
            agreed_amount_toman=1_500_000,
            start_date=today - timedelta(days=3),
            end_date=today + timedelta(days=27),
            status=MembershipStatus.ACTIVE.value,
        )
        m_maryam = Membership(
            member_id=maryam.id,
            plan_id=plan_class.id,
            agreed_amount_toman=1_200_000,
            start_date=today - timedelta(days=2),
            end_date=today + timedelta(days=43),
            status=MembershipStatus.ACTIVE.value,
            sessions_remaining=7,
        )
        m_reza = Membership(
            member_id=reza.id,
            plan_id=plan_month.id,
            agreed_amount_toman=1_500_000,
            start_date=today,
            end_date=today + timedelta(days=30),
            status=MembershipStatus.PENDING.value,
        )
        m_elham = Membership(
            member_id=elham.id,
            plan_id=plan_month.id,
            agreed_amount_toman=0,  # gift / zero allowed
            start_date=today - timedelta(days=1),
            end_date=today + timedelta(days=29),
            status=MembershipStatus.ACTIVE.value,
        )
        m_guest = Membership(
            member_id=guest.id,
            plan_id=plan_guest.id,
            agreed_amount_toman=250_000,
            start_date=today,
            end_date=today,
            status=MembershipStatus.ACTIVE.value,
        )
        # Second concurrent membership for Ali (PT package)
        m_ali_pt = Membership(
            member_id=ali.id,
            plan_id=plan_pt.id,
            agreed_amount_toman=3_600_000,
            start_date=today - timedelta(days=2),
            end_date=today + timedelta(days=58),
            status=MembershipStatus.ACTIVE.value,
            sessions_remaining=12,
        )
        session.add_all(
            [
                m_ali,
                m_sara,
                m_mohammad,
                m_negar,
                m_hosein,
                m_maryam,
                m_reza,
                m_elham,
                m_guest,
                m_ali_pt,
            ]
        )
        session.flush()

        receipt_n = 10001

        def receipt() -> str:
            nonlocal receipt_n
            value = f"R-{receipt_n}"
            receipt_n += 1
            return value

        payments = [
            # Ali: paid month fully; PT only partial → debt on PT
            Payment(
                member_id=ali.id,
                membership_id=m_ali.id,
                amount_toman=1_500_000,
                method=PaymentMethod.POS.value,
                status=PaymentStatus.PAID.value,
                receipt_number=receipt(),
                title="پرداخت ماهانه",
                paid_at=now - timedelta(days=10),
                created_by_user_id=receptionist.id,
            ),
            Payment(
                member_id=ali.id,
                membership_id=m_ali_pt.id,
                amount_toman=1_000_000,
                method=PaymentMethod.CASH.value,
                status=PaymentStatus.PAID.value,
                receipt_number=receipt(),
                title="بیعانه بسته مربی",
                paid_at=now - timedelta(days=2),
                created_by_user_id=receptionist.id,
            ),
            # Sara: fully paid
            Payment(
                member_id=sara.id,
                membership_id=m_sara.id,
                amount_toman=3_800_000,
                method=PaymentMethod.TRANSFER.value,
                status=PaymentStatus.PAID.value,
                receipt_number=receipt(),
                title="سه‌ماهه",
                paid_at=now - timedelta(days=80),
                created_by_user_id=manager.id,
            ),
            # Mohammad expired but paid (no debt)
            Payment(
                member_id=mohammad.id,
                membership_id=m_mohammad.id,
                amount_toman=1_500_000,
                method=PaymentMethod.CASH.value,
                status=PaymentStatus.PAID.value,
                receipt_number=receipt(),
                title="ماهانه منقضی",
                paid_at=now - timedelta(days=40),
                created_by_user_id=receptionist.id,
            ),
            # Negar: partial debt
            Payment(
                member_id=negar.id,
                membership_id=m_negar.id,
                amount_toman=2_000_000,
                method=PaymentMethod.POS.value,
                status=PaymentStatus.PAID.value,
                receipt_number=receipt(),
                title="بخشی از بسته مربی",
                paid_at=now - timedelta(days=5),
                created_by_user_id=receptionist.id,
            ),
            # Hosein: unpaid → full debt (valid membership + debt → check-in allowed later)
            # Maryam: fully paid
            Payment(
                member_id=maryam.id,
                membership_id=m_maryam.id,
                amount_toman=1_200_000,
                method=PaymentMethod.ONLINE.value,  # method present; no gateway
                status=PaymentStatus.PAID.value,
                receipt_number=receipt(),
                title="بسته کلاس",
                paid_at=now - timedelta(days=2),
                created_by_user_id=receptionist.id,
            ),
            # Reza pending membership: no payment yet
            # Elham gift: zero agreed, no payment needed
            Payment(
                member_id=guest.id,
                membership_id=m_guest.id,
                amount_toman=250_000,
                method=PaymentMethod.CASH.value,
                status=PaymentStatus.PAID.value,
                receipt_number=receipt(),
                title="مهمان روزانه",
                paid_at=now,
                created_by_user_id=receptionist.id,
            ),
        ]
        session.add_all(payments)

        # Attendances
        session.add_all(
            [
                Attendance(
                    member_id=ali.id,
                    membership_id=m_ali.id,
                    check_in_at=now - timedelta(hours=5),
                    check_out_at=now - timedelta(hours=3),
                    attendance_type=AttendanceType.GYM.value,
                    recorded_by_user_id=receptionist.id,
                ),
                Attendance(
                    member_id=sara.id,
                    membership_id=m_sara.id,
                    check_in_at=now - timedelta(days=1, hours=4),
                    check_out_at=now - timedelta(days=1, hours=2),
                    attendance_type=AttendanceType.GYM.value,
                    recorded_by_user_id=receptionist.id,
                ),
                Attendance(
                    member_id=negar.id,
                    membership_id=m_negar.id,
                    check_in_at=now - timedelta(hours=2),
                    check_out_at=None,
                    attendance_type=AttendanceType.PT.value,
                    recorded_by_user_id=trainer1.id,
                ),
                Attendance(
                    member_id=maryam.id,
                    membership_id=m_maryam.id,
                    check_in_at=now - timedelta(days=2, hours=6),
                    check_out_at=now - timedelta(days=2, hours=5),
                    attendance_type=AttendanceType.CLASS.value,
                    recorded_by_user_id=receptionist.id,
                ),
            ]
        )

        lockers = [Locker(code="L-01"), Locker(code="L-02")]
        session.add_all(lockers)
        session.flush()
        session.add(
            LockerAssignment(
                locker_id=lockers[0].id,
                member_id=sara.id,
                membership_id=m_sara.id,
                note="طرح شامل کمد",
            )
        )

        session.add_all(
            [
                TrainerMemberAssignment(
                    trainer_user_id=trainer1.id,
                    member_id=negar.id,
                ),
                TrainerMemberAssignment(
                    trainer_user_id=trainer1.id,
                    member_id=ali.id,
                ),
                TrainerMemberAssignment(
                    trainer_user_id=trainer2.id,
                    member_id=ali.id,  # multi-trainer
                ),
            ]
        )
        session.add(
            WorkoutPlan(
                member_id=negar.id,
                trainer_user_id=trainer1.id,
                title="برنامه هفته ۱",
                body="اسکات ۳×۱۰ — پرس سینه ۳×۸ — پلانک ۳×۴۵ث",
            )
        )

        group_class = GroupClass(
            title="کراس‌فیت صبح",
            trainer_user_id=trainer2.id,
            capacity=12,
            gender_label=GenderLabel.MIXED.value,
            starts_at=now + timedelta(days=1, hours=2),
            ends_at=now + timedelta(days=1, hours=3),
            is_active=True,
        )
        session.add(group_class)
        session.flush()
        session.add(
            ClassBooking(
                group_class_id=group_class.id,
                member_id=maryam.id,
                status=BookingStatus.BOOKED.value,
            )
        )

        session.add(
            TrialLead(
                full_name="آرش آزمایشی",
                mobile="09129999001",
                preferred_time_note="عصرها",
                message="درخواست جلسه آزمایشی از سایت",
                status=TrialLeadStatus.NEW.value,
            )
        )
        session.add(
            Expense(
                category=ExpenseCategory.RENT.value,
                amount_toman=25_000_000,
                expense_date=today.replace(day=1),
                note="اجاره ماهانه ساختگی",
                created_by_user_id=manager.id,
            )
        )
        session.add(
            AuditLog(
                actor_user_id=manager.id,
                action="seed.run",
                entity_type="database",
                entity_id="dev",
                summary="بارگذاری دادهٔ ساختگی توسعه",
                payload={"source": "app.db.seed"},
            )
        )

        session.commit()

        # Consistency check for debt logic (raises if seed is inconsistent)
        for member in (ali, hosein, negar, elham):
            ms = session.scalars(
                select(Membership).where(Membership.member_id == member.id)
            ).all()
            ps = session.scalars(select(Payment).where(Payment.member_id == member.id)).all()
            summary = member_debt(ms, ps)
            asserted = summary.agreed_total_toman - summary.paid_total_toman
            if asserted < 0:
                raise RuntimeError(
                    f"Seed debt inconsistency for {member.display_id}: paid > agreed"
                )
            if summary.debt_toman != max(asserted, 0):
                raise RuntimeError(f"Seed debt helper mismatch for {member.display_id}")

        return {
            "users": 4,
            "members": len(members),
            "plans": len(plans),
            "memberships": 10,
            "payments": len(payments),
            "lockers": 2,
            "group_classes": 1,
        }
    except Exception:
        session.rollback()
        raise
    finally:
        if own_session:
            session.close()


def main() -> None:
    # Ensure DB is reachable
    with engine.connect() as conn:
        conn.exec_driver_sql("SELECT 1")
    counts = seed()
    print("Seed OK:", counts)


if __name__ == "__main__":
    main()
