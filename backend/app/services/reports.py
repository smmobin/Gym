"""Manager expenses and display profit (paid income − expenses).

Income date field: COALESCE(payments.paid_at, payments.created_at) in Asia/Tehran
calendar day. Refunded/pending payments are excluded (status must be paid).
"""

from __future__ import annotations

from calendar import monthrange
from datetime import date, datetime, time, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.enums import ExpenseCategory, PaymentStatus, StaffRole
from app.models.expense import Expense
from app.models.payment import Payment
from app.models.user import User

TEHRAN = ZoneInfo("Asia/Tehran")
_CATEGORIES = {c.value for c in ExpenseCategory}


class ReportError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


def today_tehran() -> date:
    return datetime.now(tz=TEHRAN).date()


def default_month_range(*, today: date | None = None) -> tuple[date, date]:
    """Current Tehran calendar month (first day → last day)."""
    d = today or today_tehran()
    last = monthrange(d.year, d.month)[1]
    return date(d.year, d.month, 1), date(d.year, d.month, last)


def ensure_manager(user: User) -> None:
    if user.role != StaffRole.MANAGER.value:
        raise ReportError(403, "فقط مدیر به گزارش هزینه و سود دسترسی دارد.")


def resolve_range(
    from_raw: date | None,
    to_raw: date | None,
) -> tuple[date, date]:
    if from_raw is None and to_raw is None:
        return default_month_range()
    start, end = default_month_range()
    if from_raw is not None:
        start = from_raw
    if to_raw is not None:
        end = to_raw
    if end < start:
        raise ReportError(422, "تاریخ پایان نمی‌تواند قبل از تاریخ شروع باشد.")
    return start, end


def range_bounds_utc(from_date: date, to_date: date) -> tuple[datetime, datetime]:
    """Inclusive Tehran calendar dates [from_date, to_date] → [start, end) UTC."""
    from datetime import timedelta

    start_local = datetime.combine(from_date, time.min, tzinfo=TEHRAN)
    end_local = datetime.combine(to_date + timedelta(days=1), time.min, tzinfo=TEHRAN)
    return start_local.astimezone(timezone.utc), end_local.astimezone(timezone.utc)


def list_expenses(
    db: Session,
    *,
    user: User,
    from_date: date | None = None,
    to_date: date | None = None,
) -> tuple[list[Expense], date, date, int]:
    ensure_manager(user)
    start, end = resolve_range(from_date, to_date)
    rows = list(
        db.scalars(
            select(Expense)
            .where(Expense.expense_date >= start, Expense.expense_date <= end)
            .order_by(Expense.expense_date.desc(), Expense.id.desc())
        ).all()
    )
    total_amount = sum(r.amount_toman for r in rows)
    return rows, start, end, total_amount


def create_expense(
    db: Session,
    *,
    user: User,
    category: str,
    amount_toman: int,
    expense_date: date,
    note: str | None = None,
) -> Expense:
    ensure_manager(user)
    if amount_toman < 0:
        raise ReportError(422, "مبلغ هزینه نمی‌تواند منفی باشد.")
    if category not in _CATEGORIES:
        raise ReportError(
            422,
            "دسته نامعتبر است. یکی از: rent, salary, purchase, utilities, other",
        )
    row = Expense(
        category=category,
        amount_toman=amount_toman,
        expense_date=expense_date,
        note=note,
        created_by_user_id=user.id,
    )
    db.add(row)
    db.flush()
    return row


def sum_expenses_toman(db: Session, *, from_date: date, to_date: date) -> int:
    value = db.scalar(
        select(func.coalesce(func.sum(Expense.amount_toman), 0)).where(
            Expense.expense_date >= from_date,
            Expense.expense_date <= to_date,
        )
    )
    return int(value or 0)


def sum_paid_income_toman(db: Session, *, from_date: date, to_date: date) -> int:
    """Sum paid payments whose effective timestamp falls in [from_date, to_date] Tehran.

    Effective timestamp = COALESCE(paid_at, created_at). Refunded are excluded.
    """
    start_utc, end_utc = range_bounds_utc(from_date, to_date)
    effective = func.coalesce(Payment.paid_at, Payment.created_at)
    value = db.scalar(
        select(func.coalesce(func.sum(Payment.amount_toman), 0)).where(
            Payment.status == PaymentStatus.PAID.value,
            effective >= start_utc,
            effective < end_utc,
        )
    )
    return int(value or 0)


def profit_report(
    db: Session,
    *,
    user: User,
    from_date: date | None = None,
    to_date: date | None = None,
) -> dict:
    ensure_manager(user)
    start, end = resolve_range(from_date, to_date)
    income = sum_paid_income_toman(db, from_date=start, to_date=end)
    expenses = sum_expenses_toman(db, from_date=start, to_date=end)
    return {
        "from": start,
        "to": end,
        "income_paid_toman": income,
        "expenses_toman": expenses,
        "profit_toman": income - expenses,
    }
