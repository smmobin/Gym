"""Whether the builder log viewer may answer at all.

Production-like environments always stay closed (404), even if the flag and a
token were set by mistake. Real servers should read logs from disk / SSH.
"""

from __future__ import annotations

import hmac

from app.core.config import Settings

MIN_DEV_LOG_TOKEN_LEN = 24


def dev_log_viewer_enabled(settings: Settings) -> bool:
    if settings.is_production_like:
        return False
    if not settings.dev_log_viewer:
        return False
    return len(expected_dev_log_token(settings)) >= MIN_DEV_LOG_TOKEN_LEN


def expected_dev_log_token(settings: Settings) -> str:
    return (settings.dev_log_viewer_token or "").strip()


def dev_log_token_matches(settings: Settings, provided: str | None) -> bool:
    expected = expected_dev_log_token(settings)
    got = (provided or "").strip()
    if not expected or not got or len(got) != len(expected):
        return False
    return hmac.compare_digest(got.encode("utf-8"), expected.encode("utf-8"))
