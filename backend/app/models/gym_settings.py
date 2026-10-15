"""Single-gym settings (Azar). One logical row for the club."""

from datetime import datetime, time
from typing import Optional

from sqlalchemy import DateTime, Integer, String, Text, Time, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class GymSettings(Base):
    __tablename__ = "gym_settings"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    gym_name: Mapped[str] = mapped_column(String(200), nullable=False, default="باشگاه آذر")
    phone: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Default end-of-day auto check-out
    day_end_time: Mapped[time] = mapped_column(Time, nullable=False, default=time(23, 0))
    expiry_warning_days: Mapped[int] = mapped_column(Integer, nullable=False, default=7)
    freeze_annual_cap_days: Mapped[int] = mapped_column(Integer, nullable=False, default=14)
    working_hours_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    renewal_rules_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), onupdate=func.now(), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
