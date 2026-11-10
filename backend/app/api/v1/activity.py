"""Manager-only system activity (audit subset + error summaries) and .log export."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.db import get_db
from app.models.enums import StaffRole
from app.models.user import User
from app.schemas.activity import ActivityItemOut, ActivityListResponse
from app.services import activity as activity_svc

router = APIRouter(prefix="/manager", tags=["manager-activity"])

_MANAGER = (StaffRole.MANAGER.value,)


def _raise(err: activity_svc.ActivityError) -> None:
    raise HTTPException(status_code=err.status_code, detail=err.detail) from err


@router.get(
    "/activity",
    response_model=ActivityListResponse,
    response_model_by_alias=True,
)
def list_activity(
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    q: str | None = Query(default=None, max_length=80),
    category: str | None = Query(default=None, max_length=20),
    cursor: str | None = Query(default=None, max_length=64),
    limit: int = Query(default=activity_svc.DEFAULT_LIMIT, ge=1, le=activity_svc.MAX_LIMIT),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_MANAGER)),
) -> ActivityListResponse:
    try:
        page = activity_svc.list_activity(
            db,
            user=user,
            from_date=from_date,
            to_date=to_date,
            q=q,
            category=category,
            cursor=cursor,
            limit=limit,
        )
    except activity_svc.ActivityError as err:
        _raise(err)
        raise  # pragma: no cover
    return ActivityListResponse(
        items=[ActivityItemOut.model_validate(i.as_dict()) for i in page.items],
        from_date=page.from_date,
        to_date=page.to_date,
        next_cursor=page.next_cursor,
        categories=list(activity_svc.CATEGORIES),
    )


@router.get("/activity/export", response_class=PlainTextResponse)
def export_activity(
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    q: str | None = Query(default=None, max_length=80),
    category: str | None = Query(default=None, max_length=20),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*_MANAGER)),
) -> PlainTextResponse:
    try:
        page = activity_svc.list_activity(
            db,
            user=user,
            from_date=from_date,
            to_date=to_date,
            q=q,
            category=category,
            limit=activity_svc.EXPORT_MAX_ROWS,
        )
    except activity_svc.ActivityError as err:
        _raise(err)
        raise  # pragma: no cover
    filename = activity_svc.export_filename(page.from_date, page.to_date)
    return PlainTextResponse(
        activity_svc.render_activity_log(page, generated_by=user.full_name),
        media_type="text/plain; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )
