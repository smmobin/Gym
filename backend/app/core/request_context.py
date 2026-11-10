"""Per-request context (request_id) shared by logging, audit, and error events."""

from __future__ import annotations

import re
import uuid
from contextvars import ContextVar

REQUEST_ID_HEADER = "X-Request-ID"

_request_id_var: ContextVar[str | None] = ContextVar("gym_request_id", default=None)

# Accept a client/proxy id only if it is short and harmless in log lines.
_SAFE_INCOMING = re.compile(r"^[A-Za-z0-9._-]{8,64}$")


def new_request_id() -> str:
    return str(uuid.uuid4())


def normalize_incoming_request_id(raw: str | None) -> str:
    value = (raw or "").strip()
    if value and _SAFE_INCOMING.fullmatch(value):
        return value
    return new_request_id()


def get_request_id() -> str | None:
    return _request_id_var.get()


def set_request_id(value: str | None):
    """Returns a token for `reset_request_id`."""
    return _request_id_var.set(value)


def reset_request_id(token) -> None:
    _request_id_var.reset(token)
