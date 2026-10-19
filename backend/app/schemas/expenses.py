"""Pydantic schemas for manager expenses and profit report."""

from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from app.models.enums import ExpenseCategory

_CATEGORIES = {c.value for c in ExpenseCategory}


class ExpenseCreate(BaseModel):
    category: str
    amount_toman: int = Field(..., ge=0)
    expense_date: date
    note: Optional[str] = Field(default=None, max_length=2000)

    @field_validator("category")
    @classmethod
    def category_ok(cls, value: str) -> str:
        if value not in _CATEGORIES:
            raise ValueError(
                "دسته نامعتبر است. یکی از: rent, salary, purchase, utilities, other"
            )
        return value


class ExpenseOut(BaseModel):
    id: int
    category: str
    amount_toman: int
    expense_date: date
    note: Optional[str] = None
    created_by_user_id: Optional[int] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ExpenseListResponse(BaseModel):
    items: list[ExpenseOut]
    total: int
    from_date: date = Field(validation_alias="from", serialization_alias="from")
    to_date: date = Field(validation_alias="to", serialization_alias="to")
    expenses_toman: int

    model_config = {"populate_by_name": True}


class ProfitReportResponse(BaseModel):
    from_date: date = Field(validation_alias="from", serialization_alias="from")
    to_date: date = Field(validation_alias="to", serialization_alias="to")
    income_paid_toman: int
    expenses_toman: int
    profit_toman: int
    # Explicit: debt is NOT income (business-rules §6)
    note: str = "بدهی ≠ درآمد؛ فقط پرداخت‌های paid در درآمد آمده‌اند."

    model_config = {"populate_by_name": True}
