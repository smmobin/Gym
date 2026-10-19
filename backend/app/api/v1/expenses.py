"""Manager-only expenses and profit report."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.db import get_db
from app.models.enums import StaffRole
from app.models.user import User
from app.schemas.expenses import (
    ExpenseCreate,
    ExpenseListResponse,
    ExpenseOut,
    ProfitReportResponse,
)
from app.services import reports as reports_svc

router = APIRouter(tags=["expenses"])

_MANAGER = (StaffRole.MANAGER.value,)


def _raise(err: reports_svc.ReportError) -> None:
    raise HTTPException(status_code=err.status_code, detail=err.detail) from err


@router.get("/expenses", response_model=ExpenseListResponse)
def list_expenses(
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_MANAGER)),
) -> ExpenseListResponse:
    try:
        rows, start, end, total_amount = reports_svc.list_expenses(
            db, user=user, from_date=from_date, to_date=to_date
        )
    except reports_svc.ReportError as err:
        _raise(err)
        raise  # pragma: no cover
    return ExpenseListResponse.model_validate(
        {
            "items": [ExpenseOut.model_validate(r) for r in rows],
            "total": len(rows),
            "from": start,
            "to": end,
            "expenses_toman": total_amount,
        }
    )


@router.post("/expenses", response_model=ExpenseOut, status_code=status.HTTP_201_CREATED)
def create_expense(
    body: ExpenseCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_MANAGER)),
) -> ExpenseOut:
    try:
        row = reports_svc.create_expense(
            db,
            user=user,
            category=body.category,
            amount_toman=body.amount_toman,
            expense_date=body.expense_date,
            note=body.note,
        )
        db.commit()
        db.refresh(row)
    except reports_svc.ReportError as err:
        db.rollback()
        _raise(err)
        raise  # pragma: no cover
    return ExpenseOut.model_validate(row)


@router.get("/reports/profit", response_model=ProfitReportResponse)
def profit_report(
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_MANAGER)),
) -> ProfitReportResponse:
    try:
        data = reports_svc.profit_report(
            db, user=user, from_date=from_date, to_date=to_date
        )
    except reports_svc.ReportError as err:
        _raise(err)
        raise  # pragma: no cover
    return ProfitReportResponse.model_validate(data)
