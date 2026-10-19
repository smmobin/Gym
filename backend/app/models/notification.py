"""Desk-wide staff notifications (v1). Read state is per-user."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class StaffNotification(Base):
    """
    Global desk notification (not per-user inbox rows).

    role_audience:
      - all_staff: manager + receptionist + trainer
      - desk: manager + receptionist
      - manager / receptionist: single role
    """

    __tablename__ = "staff_notifications"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    kind: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    role_audience: Mapped[str] = mapped_column(
        String(32), nullable=False, default="desk", server_default="desk"
    )
    entity_type: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    entity_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    # Derived notifications (expiring / debt) are refreshed on GET; seed/manual are not.
    is_derived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), onupdate=func.now(), nullable=True
    )


class StaffNotificationRead(Base):
    """Per-user read flag for a desk notification."""

    __tablename__ = "staff_notification_reads"
    __table_args__ = (
        UniqueConstraint(
            "notification_id",
            "user_id",
            name="uq_staff_notification_reads_notification_user",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    notification_id: Mapped[int] = mapped_column(
        ForeignKey("staff_notifications.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    read_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
