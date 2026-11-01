"""Landing member testimonials (quotes) managed from the desk."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class MemberTestimonial(Base):
    __tablename__ = "member_testimonials"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    author_name: Mapped[str] = mapped_column(String(120), nullable=False)
    author_meta: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), onupdate=func.now(), nullable=True
    )
