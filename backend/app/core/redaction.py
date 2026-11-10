"""Central redaction for logs and exported activity text.

Secrets (password, API key, token, cookie, Authorization, OTP) are never written to
any log file. Mobiles are masked everywhere except `sensitive.log`.
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from typing import Any

REDACTED = "[REDACTED]"

_SENSITIVE_KEY_PARTS = (
    "password",
    "passwd",
    "secret",
    "api_key",
    "apikey",
    "token",
    "authorization",
    "cookie",
    "otp",
    "code_hash",
    "merchant_id",
)
# Exact keys only — e.g. `session_count` on plans is not a secret.
_SENSITIVE_EXACT_KEYS = frozenset({"code", "pin", "session", "session_id", "sid"})

_KV_SECRET = re.compile(
    r"(?i)\b(password|passwd|password_hash|new_password|secret(?:_key)?|api[_-]?key|"
    r"sms_api_key|access_token|refresh_token|token|session|cookie|otp|code)"
    r"(\s*[=:]\s*)(\"[^\"]*\"|'[^']*'|[^\s,;&|}]+)"
)
_BEARER = re.compile(r"(?i)\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]+")
# Header value: optional auth scheme + token, or a `k=v; k2=v2` cookie list.
_AUTH_HEADER = re.compile(
    r"(?i)(authorization|cookie|set-cookie)(\s*:\s*)"
    r"((?:bearer|basic)\s+[^\s|]+|[^\s;|]+(?:;\s*[^\s;|]+)*;?)"
)
# OTP inside SMS copy, e.g. «کد ورود GYM CONTROL: 123456»
# Not a masked mobile like «کد … (0912***0003)»: no «(» in the gap, no «*» after digits.
_OTP_IN_TEXT = re.compile(r"(کد[^0-9۰-۹\n(]{0,32}?)([0-9۰-۹]{4,8})(?![0-9۰-۹*])")
# Iranian mobile 09xxxxxxxxx (Latin digits)
_MOBILE = re.compile(r"(?<![0-9])(09\d{2})(\d{3})(\d{4})(?![0-9])")


def mask_mobile(mobile: str | None) -> str:
    raw = (mobile or "").strip()
    if len(raw) >= 8:
        return f"{raw[:4]}***{raw[-4:]}"
    if raw:
        return "***"
    return "—"


def _is_sensitive_key(key: str) -> bool:
    k = key.strip().lower()
    if k in _SENSITIVE_EXACT_KEYS:
        return True
    return any(part in k for part in _SENSITIVE_KEY_PARTS)


def redact_mapping(data: Any) -> Any:
    """Deep-copy dict/list with sensitive keys replaced by [REDACTED]."""
    if isinstance(data, Mapping):
        out: dict[str, Any] = {}
        for key, value in data.items():
            if isinstance(key, str) and _is_sensitive_key(key):
                out[key] = REDACTED
            else:
                out[key] = redact_mapping(value)
        return out
    if isinstance(data, (list, tuple)):
        return [redact_mapping(v) for v in data]
    return data


def redact_text(text: str, *, mask_mobiles: bool = True, mask_otp: bool = True) -> str:
    if not text:
        return text
    out = _AUTH_HEADER.sub(lambda m: f"{m.group(1)}{m.group(2)}{REDACTED}", text)
    out = _BEARER.sub(lambda m: f"{m.group(1)} {REDACTED}", out)
    out = _KV_SECRET.sub(lambda m: f"{m.group(1)}{m.group(2)}{REDACTED}", out)
    if mask_otp:
        out = _OTP_IN_TEXT.sub(lambda m: f"{m.group(1)}{REDACTED}", out)
    if mask_mobiles:
        out = _MOBILE.sub(lambda m: f"{m.group(1)}***{m.group(3)}", out)
    return out
