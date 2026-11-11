"""HTTP hardening: security headers on every response + Origin check for unsafe API calls."""

from __future__ import annotations

import json
from urllib.parse import urlsplit

from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.config import Settings

UNSAFE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})

# sha256 of the identical theme boot snippet in every panel <head>.
# Must match frontend/assets/js/theme.js THEME_BOOT_SCRIPT exactly (no 'unsafe-inline').
_THEME_BOOT_HASH = "sha256-W3YwdAMeD3w3Co3UGTK4witGFGy1Xr4YGVQfCbXiX4I="

FRONTEND_CSP = "; ".join(
    [
        "default-src 'self'",
        f"script-src 'self' '{_THEME_BOOT_HASH}'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        "img-src 'self' data: blob:",
        "connect-src 'self'",
        "manifest-src 'self'",
        "worker-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
    ]
)
API_CSP = "default-src 'none'; frame-ancestors 'none'"

_BASE_HEADERS = (
    ("x-content-type-options", "nosniff"),
    ("x-frame-options", "DENY"),
    ("referrer-policy", "strict-origin-when-cross-origin"),
    ("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()"),
    ("cross-origin-opener-policy", "same-origin"),
)
_HSTS = "max-age=31536000; includeSubDomains"


def _is_api_path(path: str, api_prefix: str) -> bool:
    return path == api_prefix or path.startswith(api_prefix.rstrip("/") + "/")


class SecurityHeadersMiddleware:
    def __init__(self, app: ASGIApp, *, settings: Settings) -> None:
        self.app = app
        self.api_prefix = settings.api_prefix
        self.hsts = settings.is_production_like

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        is_api = _is_api_path(scope.get("path", ""), self.api_prefix)

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                for name, value in _BASE_HEADERS:
                    if name not in headers:
                        headers[name] = value
                if "content-security-policy" not in headers:
                    headers["content-security-policy"] = API_CSP if is_api else FRONTEND_CSP
                if is_api and "cache-control" not in headers:
                    headers["cache-control"] = "no-store"
                if self.hsts and "strict-transport-security" not in headers:
                    headers["strict-transport-security"] = _HSTS
            await send(message)

        await self.app(scope, receive, send_wrapper)


def _origin_of(url: str) -> str:
    parts = urlsplit(url.strip())
    if not parts.scheme or not parts.netloc:
        return ""
    return f"{parts.scheme.lower()}://{parts.netloc.lower()}"


class OriginCheckMiddleware:
    """Reject cross-site state-changing API requests (CSRF defense beside SameSite=Lax).

    Browsers always send Origin on cross-origin POST/PATCH/DELETE, so a request whose
    Origin is neither this host nor a CORS-allowed origin is refused. Requests without
    Origin (server-to-server, curl, tests) are not browser CSRF and pass through.
    """

    def __init__(self, app: ASGIApp, *, settings: Settings) -> None:
        self.app = app
        self.api_prefix = settings.api_prefix
        self.allowed = {_origin_of(o) for o in settings.cors_origin_list} - {""}

    def _allowed(self, origin: str, headers: Headers) -> bool:
        normalized = _origin_of(origin)
        if not normalized:
            return False
        if normalized in self.allowed:
            return True
        host = (headers.get("host") or "").strip().lower()
        return bool(host) and urlsplit(normalized).netloc == host

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if (
            scope["type"] != "http"
            or scope.get("method", "GET").upper() not in UNSAFE_METHODS
            or not _is_api_path(scope.get("path", ""), self.api_prefix)
        ):
            await self.app(scope, receive, send)
            return
        headers = Headers(scope=scope)
        origin = headers.get("origin")
        if origin is None or self._allowed(origin, headers):
            await self.app(scope, receive, send)
            return
        body = json.dumps(
            {"detail": "درخواست از مبدأ نامعتبر رد شد."}, ensure_ascii=False
        ).encode("utf-8")
        await send(
            {
                "type": "http.response.start",
                "status": 403,
                "headers": [
                    (b"content-type", b"application/json; charset=utf-8"),
                    (b"content-length", str(len(body)).encode()),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})
