"""Staff in-app notifications."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.db import get_db
from app.models.enums import StaffRole
from app.models.user import User
from app.schemas.notifications import (
    NotificationListResponse,
    NotificationOut,
    NotificationReadAllResponse,
    NotificationReadResponse,
)
from app.services import notifications as notif_svc

router = APIRouter(tags=["notifications"])

_STAFF = (
    StaffRole.MANAGER.value,
    StaffRole.RECEPTIONIST.value,
    StaffRole.TRAINER.value,
)


def _raise(err: notif_svc.NotificationError) -> None:
    raise HTTPException(status_code=err.status_code, detail=err.detail) from err


@router.get("/notifications", response_model=NotificationListResponse)
def list_notifications(
    unread_only: bool = Query(default=False),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_STAFF)),
) -> NotificationListResponse:
    items, unread_count = notif_svc.list_for_user(
        db, user=user, unread_only=unread_only
    )
    db.commit()
    return NotificationListResponse(
        items=[NotificationOut.model_validate(i) for i in items],
        total=len(items),
        unread_count=unread_count,
    )


@router.post(
    "/notifications/{notification_id}/read",
    response_model=NotificationReadResponse,
)
def mark_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_STAFF)),
) -> NotificationReadResponse:
    try:
        row = notif_svc.mark_read(db, user=user, notification_id=notification_id)
        db.commit()
    except notif_svc.NotificationError as err:
        db.rollback()
        _raise(err)
        raise  # pragma: no cover
    return NotificationReadResponse(id=row.id, is_read=True)


@router.post(
    "/notifications/read-all",
    response_model=NotificationReadAllResponse,
    status_code=status.HTTP_200_OK,
)
def mark_all_notifications_read(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_STAFF)),
) -> NotificationReadAllResponse:
    marked = notif_svc.mark_all_read(db, user=user)
    db.commit()
    return NotificationReadAllResponse(marked=marked)
