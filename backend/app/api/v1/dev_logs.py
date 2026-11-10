"""Builder-only log viewer API. 404 unless DEV_LOG_VIEWER + long token, never in production."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.db import get_db
from app.core.dev_log_gate import dev_log_token_matches, dev_log_viewer_enabled
from app.services import activity as activity_svc
from app.services import dev_logs as dev_log_svc

router = APIRouter(prefix="/dev/logs", tags=["dev-logs"])

_TOKEN_HEADER = "X-Dev-Log-Token"


def _require_viewer(
    settings: Settings = Depends(get_settings),
    x_dev_log_token: str | None = Header(default=None, alias=_TOKEN_HEADER),
) -> Settings:
    if not dev_log_viewer_enabled(settings):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")
    if not dev_log_token_matches(settings, x_dev_log_token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="توکن بینندهٔ لاگ نادرست است.",
        )
    return settings


def _raise(err: dev_log_svc.DevLogError) -> None:
    raise HTTPException(status_code=err.status_code, detail=err.detail) from err


@router.get("/files")
def list_files(settings: Settings = Depends(_require_viewer)) -> dict:
    return {"items": dev_log_svc.list_log_files(settings)}


@router.get("/read")
def read_file(
    file: str = Query(min_length=1, max_length=32),
    offset: int | None = Query(default=None, ge=0),
    limit: int = Query(default=dev_log_svc.DEFAULT_LIMIT, ge=1, le=dev_log_svc.MAX_LIMIT),
    q: str = Query(default=""),
    level: str = Query(default=""),
    rid: str = Query(default=""),
    settings: Settings = Depends(_require_viewer),
) -> dict:
    try:
        return dev_log_svc.read_log_window(
            settings,
            file_key=file,
            offset=offset,
            limit=limit,
            q=q,
            level=level,
            rid=rid,
        )
    except dev_log_svc.DevLogError as err:
        _raise(err)
        raise  # pragma: no cover


@router.get("/download")
def download_file(
    file: str = Query(min_length=1, max_length=64),
    start_line: int | None = Query(default=None, ge=1),
    end_line: int | None = Query(default=None, ge=1),
    settings: Settings = Depends(_require_viewer),
) -> Response:
    try:
        body, filename = dev_log_svc.download_bytes(
            settings,
            file_key=file,
            start_line=start_line,
            end_line=end_line,
        )
    except dev_log_svc.DevLogError as err:
        _raise(err)
        raise  # pragma: no cover
    return Response(
        content=body,
        media_type="text/plain; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


@router.get("/activity")
def precise_activity(
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    q: str | None = Query(default=None, max_length=80),
    category: str | None = Query(default=None, max_length=20),
    cursor: str | None = Query(default=None, max_length=80),
    limit: int = Query(default=activity_svc.DEFAULT_LIMIT, ge=1, le=200),
    db: Session = Depends(get_db),
    _settings: Settings = Depends(_require_viewer),
) -> dict:
    """Same manager activity events, with payload and full request id. Token-gated."""
    try:
        page = activity_svc.list_activity_precise(
            db,
            from_date=from_date,
            to_date=to_date,
            q=q,
            category=category,
            cursor=cursor,
            limit=limit,
        )
    except activity_svc.ActivityError as err:
        raise HTTPException(status_code=err.status_code, detail=err.detail) from err
    return {
        "items": [item.as_precise_dict() for item in page.items],
        "from": page.from_date.isoformat(),
        "to": page.to_date.isoformat(),
        "next_cursor": page.next_cursor,
        "categories": list(activity_svc.CATEGORIES),
    }
