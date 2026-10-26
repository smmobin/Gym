"""
Fake development seed for GYM CONTROL.

Run from backend/:
  .\\.venv\\Scripts\\python.exe -m app.db.seed

Incremental / idempotent: upserts seed rows by stable keys (mobile, plan name,
locker code, receipt number, …). Does **not** clear existing domain data.
Intentional full wipe: python -m app.db.wipe_dev_data

Never put real member PII here.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.db import SessionLocal, engine
from app.core.security import hash_password
from app.models import (
    AthleteNotification,
    AthleteSession,
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
    LoginOtp,
    Member,
    MemberFileLock,
    MemberStatus,
    Membership,
    MembershipPlan,
    MembershipStatus,
    Payment,
    PaymentMethod,
    PaymentStatus,
    StaffNotification,
    StaffNotificationRead,
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
# Dev-only athlete passwords for seed members with login enabled.
DEV_ATHLETE_PASSWORD = "ChangeMe123"

SEED_MEMBER_NOTE = "دادهٔ ساختگی seed"


def clear_domain_data(session: Session) -> None:
    """Wipe domain tables in FK-safe order (dev reset / wipe). Does not drop schema."""
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
        StaffNotificationRead,
        StaffNotification,
        AthleteNotification,
        AthleteSession,
        AuditLog,
        StaffSession,
        LoginOtp,
        MemberFileLock,
        Member,
        GymSettings,
        User,
    ):
        session.execute(delete(model))
    session.commit()


def wipe_and_seed(session: Session | None = None) -> dict[str, int]:
    """Empty domain tables then seed. For tests / intentional reset — not the CLI default."""
    own_session = session is None
    session = session or SessionLocal()
    try:
        clear_domain_data(session)
        return seed(session)
    finally:
        if own_session:
            session.close()


def _get_user_by_mobile(session: Session, mobile: str) -> User | None:
    return session.scalar(select(User).where(User.mobile == mobile))


def _get_or_create_user(
    session: Session,
    *,
    mobile: str,
    full_name: str,
    role: str,
    password_hash: str,
) -> tuple[User, bool]:
    existing = _get_user_by_mobile(session, mobile)
    if existing:
        # Align non-destructive seed fields; leave password as owner may have changed it.
        existing.full_name = full_name
        existing.role = role
        session.add(existing)
        return existing, False
    user = User(
        mobile=mobile,
        password_hash=password_hash,
        full_name=full_name,
        role=role,
    )
    session.add(user)
    session.flush()
    return user, True


def _ensure_gym_settings(session: Session) -> GymSettings:
    existing = session.scalar(select(GymSettings).order_by(GymSettings.id).limit(1))
    if existing:
        return existing
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
    session.flush()
    return settings


def _get_or_create_plan(
    session: Session,
    *,
    name: str,
    description: str,
    duration_days: int | None,
    session_count: int | None,
    base_price_toman: int,
    includes_locker: bool,
) -> MembershipPlan:
    existing = session.scalar(select(MembershipPlan).where(MembershipPlan.name == name))
    if existing:
        existing.description = description
        existing.duration_days = duration_days
        existing.session_count = session_count
        existing.base_price_toman = base_price_toman
        existing.includes_locker = includes_locker
        existing.is_active = True
        session.add(existing)
        return existing
    plan = MembershipPlan(
        name=name,
        description=description,
        duration_days=duration_days,
        session_count=session_count,
        base_price_toman=base_price_toman,
        includes_locker=includes_locker,
        is_active=True,
    )
    session.add(plan)
    session.flush()
    return plan


def _get_or_create_member(
    session: Session,
    *,
    display_id: str,
    first_name: str,
    last_name: str,
    mobile: str,
    status: str,
) -> tuple[Member, bool]:
    existing = session.scalar(select(Member).where(Member.mobile == mobile))
    if existing:
        return existing, False
    # display_id may already be taken by a non-seed row — fall back to next free
    taken = session.scalar(select(Member).where(Member.display_id == display_id))
    if taken:
        display_id = _next_free_display_id(session)
    member = Member(
        display_id=display_id,
        first_name=first_name,
        last_name=last_name,
        mobile=mobile,
        status=status,
        notes=SEED_MEMBER_NOTE,
    )
    session.add(member)
    session.flush()
    return member, True


def _next_free_display_id(session: Session) -> str:
    rows = session.scalars(select(Member.display_id)).all()
    max_n = 1000
    for did in rows:
        if isinstance(did, str) and did.startswith("M-"):
            try:
                max_n = max(max_n, int(did[2:]))
            except ValueError:
                continue
    return f"M-{max_n + 1}"


def _get_or_create_locker(session: Session, code: str) -> Locker:
    existing = session.scalar(select(Locker).where(Locker.code == code))
    if existing:
        return existing
    locker = Locker(code=code)
    session.add(locker)
    session.flush()
    return locker


def _ensure_payment(
    session: Session,
    *,
    receipt_number: str,
    member_id: int,
    membership_id: int,
    amount_toman: int,
    method: str,
    status: str,
    title: str,
    paid_at: datetime,
    created_by_user_id: int,
) -> Payment:
    existing = session.scalar(
        select(Payment).where(Payment.receipt_number == receipt_number)
    )
    if existing:
        return existing
    payment = Payment(
        member_id=member_id,
        membership_id=membership_id,
        amount_toman=amount_toman,
        method=method,
        status=status,
        receipt_number=receipt_number,
        title=title,
        paid_at=paid_at,
        created_by_user_id=created_by_user_id,
    )
    session.add(payment)
    return payment


def _member_has_memberships(session: Session, member_id: int) -> bool:
    n = session.scalar(
        select(func.count()).select_from(Membership).where(Membership.member_id == member_id)
    )
    return int(n or 0) > 0


def _get_or_create_group_class(
    session: Session,
    *,
    title: str,
    trainer_user_id: int,
    capacity: int,
    gender_label: str,
    starts_at: datetime,
    ends_at: datetime,
) -> tuple[GroupClass, bool]:
    existing = session.scalar(select(GroupClass).where(GroupClass.title == title))
    if existing:
        return existing, False
    gc = GroupClass(
        title=title,
        trainer_user_id=trainer_user_id,
        capacity=capacity,
        gender_label=gender_label,
        starts_at=starts_at,
        ends_at=ends_at,
        is_active=True,
    )
    session.add(gc)
    session.flush()
    return gc, True


def _ensure_booking(
    session: Session,
    *,
    group_class_id: int,
    member_id: int,
    status: str,
) -> None:
    existing = session.scalar(
        select(ClassBooking).where(
            ClassBooking.group_class_id == group_class_id,
            ClassBooking.member_id == member_id,
        )
    )
    if existing:
        return
    session.add(
        ClassBooking(
            group_class_id=group_class_id,
            member_id=member_id,
            status=status,
        )
    )


def _ensure_expense(
    session: Session,
    *,
    category: str,
    amount_toman: int,
    expense_date: date,
    note: str,
    created_by_user_id: int,
) -> None:
    existing = session.scalar(select(Expense).where(Expense.note == note))
    if existing:
        return
    session.add(
        Expense(
            category=category,
            amount_toman=amount_toman,
            expense_date=expense_date,
            note=note,
            created_by_user_id=created_by_user_id,
        )
    )


def _ensure_staff_notification(
    session: Session,
    *,
    kind: str,
    title: str,
    body: str,
    role_audience: str,
    entity_type: str | None = None,
) -> None:
    existing = session.scalar(
        select(StaffNotification).where(StaffNotification.title == title)
    )
    if existing:
        return
    session.add(
        StaffNotification(
            kind=kind,
            title=title,
            body=body,
            role_audience=role_audience,
            entity_type=entity_type,
            entity_id=None,
            is_derived=False,
        )
    )


def seed(session: Session | None = None) -> dict[str, int]:
    """Upsert fake seed data without deleting non-seed rows."""
    own_session = session is None
    session = session or SessionLocal()
    try:
        today = date.today()
        now = datetime.now(tz=UTC)

        staff_password_hash = hash_password(DEV_STAFF_PASSWORD)
        athlete_password_hash = hash_password(DEV_ATHLETE_PASSWORD)

        manager, _ = _get_or_create_user(
            session,
            mobile="09120000001",
            full_name="مدیر نمونه",
            role=StaffRole.MANAGER.value,
            password_hash=staff_password_hash,
        )
        receptionist, _ = _get_or_create_user(
            session,
            mobile="09120000002",
            full_name="منشی نمونه",
            role=StaffRole.RECEPTIONIST.value,
            password_hash=staff_password_hash,
        )
        trainer1, _ = _get_or_create_user(
            session,
            mobile="09120000003",
            full_name="مربی یک",
            role=StaffRole.TRAINER.value,
            password_hash=staff_password_hash,
        )
        trainer2, _ = _get_or_create_user(
            session,
            mobile="09120000004",
            full_name="مربی دو",
            role=StaffRole.TRAINER.value,
            password_hash=staff_password_hash,
        )
        session.flush()

        _ensure_gym_settings(session)

        plan_month = _get_or_create_plan(
            session,
            name="ماهانه سالن",
            description="۳۰ روز دسترسی سالن",
            duration_days=30,
            session_count=None,
            base_price_toman=1_500_000,
            includes_locker=False,
        )
        plan_quarter = _get_or_create_plan(
            session,
            name="سه‌ماهه + کمد",
            description="۹۰ روز با کمد",
            duration_days=90,
            session_count=None,
            base_price_toman=4_000_000,
            includes_locker=True,
        )
        plan_pt = _get_or_create_plan(
            session,
            name="۱۲ جلسه مربی",
            description="بسته جلسه خصوصی",
            duration_days=60,
            session_count=12,
            base_price_toman=3_600_000,
            includes_locker=False,
        )
        plan_class = _get_or_create_plan(
            session,
            name="۸ جلسه کلاس گروهی",
            description="بسته کلاس",
            duration_days=45,
            session_count=8,
            base_price_toman=1_200_000,
            includes_locker=False,
        )
        plan_guest = _get_or_create_plan(
            session,
            name="مهمان یک‌روزه",
            description="عضویت موقت روزانه",
            duration_days=1,
            session_count=None,
            base_price_toman=250_000,
            includes_locker=False,
        )
        session.flush()

        member_specs = [
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
        member_is_new: list[bool] = []
        for display_id, first, last, mobile, status in member_specs:
            m, created = _get_or_create_member(
                session,
                display_id=display_id,
                first_name=first,
                last_name=last,
                mobile=mobile,
                status=status.value,
            )
            members.append(m)
            member_is_new.append(created)
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

        # Login-enabled athletes: set password only if missing (don't overwrite owner changes)
        if not ali.password_hash:
            ali.password_hash = athlete_password_hash
        if not hosein.password_hash:
            hosein.password_hash = athlete_password_hash

        def _ensure_athlete_notification(
            member_id: int, kind: str, title: str, body: str
        ) -> None:
            exists = session.scalar(
                select(AthleteNotification).where(
                    AthleteNotification.member_id == member_id,
                    AthleteNotification.title == title,
                )
            )
            if exists:
                return
            session.add(
                AthleteNotification(
                    member_id=member_id,
                    kind=kind,
                    title=title,
                    body=body,
                    is_read=False,
                )
            )

        _ensure_athlete_notification(
            ali.id,
            "welcome",
            "خوش‌آمد به پنل ورزشکار",
            "این اعلان نمونهٔ seed است. فقط دادهٔ خودتان را می‌بینید.",
        )
        _ensure_athlete_notification(
            hosein.id,
            "debt_reminder",
            "یادآوری بدهی (نمونه)",
            "بدهی در گزارش درآمد نیست؛ فقط ماندهٔ تعهد شماست.",
        )

        # Memberships + payments only when the seed member has none yet
        # (avoids duplicating demo graph on re-run; never deletes owner data).
        need_demo_graph = not _member_has_memberships(session, ali.id)

        m_ali = m_sara = m_mohammad = m_negar = m_hosein = None
        m_maryam = m_reza = m_elham = m_guest = m_ali_pt = None
        payments: list[Payment] = []

        if need_demo_graph:
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
                agreed_amount_toman=3_800_000,
                start_date=today - timedelta(days=80),
                end_date=today + timedelta(days=5),
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
                agreed_amount_toman=0,
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

            payment_specs = [
                (
                    "R-10001",
                    ali.id,
                    m_ali.id,
                    1_500_000,
                    PaymentMethod.POS.value,
                    "پرداخت ماهانه",
                    now - timedelta(days=10),
                    receptionist.id,
                ),
                (
                    "R-10002",
                    ali.id,
                    m_ali_pt.id,
                    1_000_000,
                    PaymentMethod.CASH.value,
                    "بیعانه بسته مربی",
                    now - timedelta(days=2),
                    receptionist.id,
                ),
                (
                    "R-10003",
                    sara.id,
                    m_sara.id,
                    3_800_000,
                    PaymentMethod.TRANSFER.value,
                    "سه‌ماهه",
                    now - timedelta(days=80),
                    manager.id,
                ),
                (
                    "R-10004",
                    mohammad.id,
                    m_mohammad.id,
                    1_500_000,
                    PaymentMethod.CASH.value,
                    "ماهانه منقضی",
                    now - timedelta(days=40),
                    receptionist.id,
                ),
                (
                    "R-10005",
                    negar.id,
                    m_negar.id,
                    2_000_000,
                    PaymentMethod.POS.value,
                    "بخشی از بسته مربی",
                    now - timedelta(days=5),
                    receptionist.id,
                ),
                (
                    "R-10006",
                    maryam.id,
                    m_maryam.id,
                    1_200_000,
                    PaymentMethod.ONLINE.value,
                    "بسته کلاس",
                    now - timedelta(days=2),
                    receptionist.id,
                ),
                (
                    "R-10007",
                    guest.id,
                    m_guest.id,
                    250_000,
                    PaymentMethod.CASH.value,
                    "مهمان روزانه",
                    now,
                    receptionist.id,
                ),
            ]
            for (
                receipt,
                mid,
                mship_id,
                amount,
                method,
                title,
                paid_at,
                by_id,
            ) in payment_specs:
                payments.append(
                    _ensure_payment(
                        session,
                        receipt_number=receipt,
                        member_id=mid,
                        membership_id=mship_id,
                        amount_toman=amount,
                        method=method,
                        status=PaymentStatus.PAID.value,
                        title=title,
                        paid_at=paid_at,
                        created_by_user_id=by_id,
                    )
                )

            # Attendances only when member has none
            def _ensure_attendance(
                member_id: int,
                membership_id: int,
                check_in_at: datetime,
                check_out_at: datetime | None,
                attendance_type: str,
                recorded_by_user_id: int,
            ) -> None:
                n = session.scalar(
                    select(func.count())
                    .select_from(Attendance)
                    .where(Attendance.member_id == member_id)
                )
                if int(n or 0) > 0:
                    return
                session.add(
                    Attendance(
                        member_id=member_id,
                        membership_id=membership_id,
                        check_in_at=check_in_at,
                        check_out_at=check_out_at,
                        attendance_type=attendance_type,
                        recorded_by_user_id=recorded_by_user_id,
                    )
                )

            _ensure_attendance(
                ali.id,
                m_ali.id,
                now - timedelta(hours=5),
                now - timedelta(hours=3),
                AttendanceType.GYM.value,
                receptionist.id,
            )
            _ensure_attendance(
                sara.id,
                m_sara.id,
                now - timedelta(days=1, hours=4),
                now - timedelta(days=1, hours=2),
                AttendanceType.GYM.value,
                receptionist.id,
            )
            _ensure_attendance(
                negar.id,
                m_negar.id,
                now - timedelta(hours=2),
                None,
                AttendanceType.PT.value,
                trainer1.id,
            )
            _ensure_attendance(
                maryam.id,
                m_maryam.id,
                now - timedelta(days=2, hours=6),
                now - timedelta(days=2, hours=5),
                AttendanceType.CLASS.value,
                receptionist.id,
            )

        lockers = [_get_or_create_locker(session, f"L-0{i}") for i in range(1, 6)]
        session.flush()

        if need_demo_graph and m_sara is not None:
            assign_exists = session.scalar(
                select(LockerAssignment).where(
                    LockerAssignment.locker_id == lockers[0].id,
                    LockerAssignment.released_at.is_(None),
                )
            )
            if not assign_exists:
                session.add(
                    LockerAssignment(
                        locker_id=lockers[0].id,
                        member_id=sara.id,
                        membership_id=m_sara.id,
                        note="طرح شامل کمد",
                    )
                )

        def _ensure_trainer_assignment(trainer_user_id: int, member_id: int) -> None:
            exists = session.scalar(
                select(TrainerMemberAssignment).where(
                    TrainerMemberAssignment.trainer_user_id == trainer_user_id,
                    TrainerMemberAssignment.member_id == member_id,
                )
            )
            if exists:
                return
            session.add(
                TrainerMemberAssignment(
                    trainer_user_id=trainer_user_id,
                    member_id=member_id,
                )
            )

        _ensure_trainer_assignment(trainer1.id, negar.id)
        _ensure_trainer_assignment(trainer1.id, ali.id)
        _ensure_trainer_assignment(trainer2.id, ali.id)

        wp_exists = session.scalar(
            select(WorkoutPlan).where(
                WorkoutPlan.member_id == negar.id,
                WorkoutPlan.title == "برنامه هفته ۱",
            )
        )
        if not wp_exists:
            session.add(
                WorkoutPlan(
                    member_id=negar.id,
                    trainer_user_id=trainer1.id,
                    title="برنامه هفته ۱",
                    body="اسکات ۳×۱۰ — پرس سینه ۳×۸ — پلانک ۳×۴۵ث",
                )
            )

        group_class, _ = _get_or_create_group_class(
            session,
            title="کراس‌فیت صبح",
            trainer_user_id=trainer2.id,
            capacity=12,
            gender_label=GenderLabel.MIXED.value,
            starts_at=now - timedelta(hours=3),
            ends_at=now - timedelta(hours=2),
        )
        yoga, _ = _get_or_create_group_class(
            session,
            title="یوگا بانوان",
            trainer_user_id=trainer1.id,
            capacity=10,
            gender_label=GenderLabel.WOMEN.value,
            starts_at=now + timedelta(days=2, hours=4),
            ends_at=now + timedelta(days=2, hours=5),
        )
        spin, _ = _get_or_create_group_class(
            session,
            title="اسپینینگ عصر",
            trainer_user_id=trainer2.id,
            capacity=3,
            gender_label=GenderLabel.MEN.value,
            starts_at=now + timedelta(hours=6),
            ends_at=now + timedelta(hours=7),
        )
        pilates, _ = _get_or_create_group_class(
            session,
            title="پیلاتس عصر",
            trainer_user_id=trainer1.id,
            capacity=8,
            gender_label=GenderLabel.MIXED.value,
            starts_at=now + timedelta(days=1, hours=3),
            ends_at=now + timedelta(days=1, hours=4),
        )
        session.flush()

        _ensure_booking(
            session,
            group_class_id=group_class.id,
            member_id=maryam.id,
            status=BookingStatus.BOOKED.value,
        )
        _ensure_booking(
            session,
            group_class_id=yoga.id,
            member_id=negar.id,
            status=BookingStatus.BOOKED.value,
        )
        _ensure_booking(
            session,
            group_class_id=spin.id,
            member_id=ali.id,
            status=BookingStatus.BOOKED.value,
        )
        _ensure_booking(
            session,
            group_class_id=spin.id,
            member_id=hosein.id,
            status=BookingStatus.BOOKED.value,
        )

        trial_mobile = "09129999001"
        trial_exists = session.scalar(
            select(TrialLead).where(TrialLead.mobile == trial_mobile)
        )
        if not trial_exists:
            session.add(
                TrialLead(
                    full_name="آرش آزمایشی",
                    mobile=trial_mobile,
                    preferred_time_note="عصرها",
                    message="درخواست جلسه آزمایشی از سایت",
                    status=TrialLeadStatus.NEW.value,
                )
            )

        _ensure_expense(
            session,
            category=ExpenseCategory.RENT.value,
            amount_toman=25_000_000,
            expense_date=today.replace(day=1),
            note="اجاره ماهانه ساختگی",
            created_by_user_id=manager.id,
        )
        _ensure_expense(
            session,
            category=ExpenseCategory.SALARY.value,
            amount_toman=18_000_000,
            expense_date=today.replace(day=min(5, today.day)),
            note="حقوق مربیان (ساختگی)",
            created_by_user_id=manager.id,
        )
        _ensure_expense(
            session,
            category=ExpenseCategory.UTILITIES.value,
            amount_toman=2_500_000,
            expense_date=today.replace(day=min(10, today.day)),
            note="برق و آب (ساختگی)",
            created_by_user_id=manager.id,
        )
        _ensure_expense(
            session,
            category=ExpenseCategory.PURCHASE.value,
            amount_toman=1_200_000,
            expense_date=today,
            note="خرید لوازم نظافت (ساختگی)",
            created_by_user_id=manager.id,
        )

        _ensure_staff_notification(
            session,
            kind="renewal_request",
            title="درخواست تمدید (نمونه)",
            body="نمونهٔ placeholder — لاگین ورزشکار هنوز نیست؛ فقط قالب UI/اعلان.",
            role_audience="desk",
        )
        _ensure_staff_notification(
            session,
            kind="trial_lead_new",
            title="فرم آزمایشی نمونه",
            body="برای تست زنگوله — از seed",
            role_audience="desk",
            entity_type="trial_lead",
        )

        audit_exists = session.scalar(
            select(AuditLog).where(AuditLog.action == "seed.run").limit(1)
        )
        if not audit_exists:
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

        # Consistency check for debt logic (raises if seed graph is inconsistent)
        for member in (ali, hosein, negar, elham):
            ms = session.scalars(
                select(Membership).where(Membership.member_id == member.id)
            ).all()
            ps = session.scalars(select(Payment).where(Payment.member_id == member.id)).all()
            if not ms:
                continue
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
            "plans": 5,
            "memberships": 10 if need_demo_graph else -1,
            "payments": len(payments) if need_demo_graph else -1,
            "lockers": 5,
            "group_classes": 4,
            "trainer_assignments": 3,
            "workout_plans": 1,
            "members_created": sum(1 for c in member_is_new if c),
        }
    except Exception:
        session.rollback()
        raise
    finally:
        if own_session:
            session.close()


def main() -> None:
    from app.core.config import get_settings

    settings = get_settings()
    if settings.is_production_like and not settings.allow_destructive_seed:
        raise SystemExit(
            "Refuse seed: APP_ENV is production-like. "
            "Even incremental seed must not run on real member data by default. "
            "For a throwaway staging DB only, set ALLOW_DESTRUCTIVE_SEED=true. "
            "To empty a dev DB intentionally, use: python -m app.db.wipe_dev_data"
        )

    with engine.connect() as conn:
        conn.exec_driver_sql("SELECT 1")
    counts = seed()
    print("Seed OK (incremental, no wipe):", counts)


if __name__ == "__main__":
    main()
