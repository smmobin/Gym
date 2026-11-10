"""ASGI middleware: X-Request-ID, access log line, safe 500, manager-visible error events."""

from __future__ import annotations

import json
import logging
import time

from starlette.concurrency import run_in_threadpool
from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

import app.core.db as db_mod
from app.core.logging_setup import ACCESS_LOGGER, ERROR_LOGGER
from app.core.request_context import (
    REQUEST_ID_HEADER,
    normalize_incoming_request_id,
    reset_request_id,
    set_request_id,
)

access_logger = logging.getLogger(ACCESS_LOGGER)
error_logger = logging.getLogger(ERROR_LOGGER)

# 429 on auth endpoints = possible brute force → worth a manager-visible row.
_SUSPICIOUS_429_PREFIX = "/api/v1/auth"
_PATH_MAX = 255


def should_record_error_event(status_code: int, path: str) -> bool:
    if status_code >= 500:
        return True
    return status_code == 429 and path.startswith(_SUSPICIOUS_429_PREFIX)


def _error_summary(status_code: int, error_type: str | None) -> str:
    if status_code == 429:
        return "تلاش‌های زیاد روی ورود (محدودیت نرخ)"
    if error_type:
        return f"خطای داخلی سرور ({error_type})"
    return f"خطای سرور {status_code}"


def _record_error_event(
    *,
    request_id: str,
    method: str,
    path: str,
    status_code: int,
    error_type: str | None,
) -> None:
    from app.models.system_event import SystemErrorEvent

    session = db_mod.SessionLocal()
    try:
        session.add(
            SystemErrorEvent(
                request_id=request_id,
                method=method[:10],
                path=path[:_PATH_MAX],
                status_code=status_code,
                error_type=(error_type or None) and error_type[:80],
                summary=_error_summary(status_code, error_type),
            )
        )
        session.commit()
    except Exception:
        session.rollback()
        error_logger.exception("failed to persist system_error_event path=%s", path)
    finally:
        session.close()


class RequestContextMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        request_id = normalize_incoming_request_id(headers.get(REQUEST_ID_HEADER))
        token = set_request_id(request_id)
        method = scope.get("method", "-")
        path = scope.get("path", "-")
        started = time.perf_counter()
        state = {"status": 500, "started": False}
        error_type: str | None = None

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                state["status"] = int(message["status"])
                state["started"] = True
                MutableHeaders(scope=message)[REQUEST_ID_HEADER] = request_id
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        except Exception as exc:
            error_type = type(exc).__name__
            error_logger.exception("unhandled error %s %s", method, path)
            state["status"] = 500
            if state["started"]:
                raise
            body = json.dumps(
                {"detail": "خطای داخلی سرور. لطفاً دوباره تلاش کنید.", "request_id": request_id},
                ensure_ascii=False,
            ).encode("utf-8")
            await send(
                {
                    "type": "http.response.start",
                    "status": 500,
                    "headers": [
                        (b"content-type", b"application/json; charset=utf-8"),
                        (b"content-length", str(len(body)).encode()),
                        (REQUEST_ID_HEADER.lower().encode(), request_id.encode()),
                    ],
                }
            )
            await send({"type": "http.response.body", "body": body})
        finally:
            status_code = int(state["status"])
            duration_ms = (time.perf_counter() - started) * 1000
            client = scope.get("client")
            access_logger.info(
                "method=%s path=%s status=%s duration_ms=%.1f scheme=%s client=%s",
                method,
                path,
                status_code,
                duration_ms,
                scope.get("scheme", "http"),
                client[0] if client else "-",
            )
            if should_record_error_event(status_code, path):
                await run_in_threadpool(
                    _record_error_event,
                    request_id=request_id,
                    method=method,
                    path=path,
                    status_code=status_code,
                    error_type=error_type,
                )
            reset_request_id(token)
