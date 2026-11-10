"""Shared SMS adapter types — no provider-specific details."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Protocol

from app.core.logging_setup import SENSITIVE_LOGGER
from app.core.redaction import mask_mobile

_sms_logger = logging.getLogger("gym.sms")
_sensitive_logger = logging.getLogger(SENSITIVE_LOGGER)


def log_sms_failure(
    *,
    context: str,
    provider: str,
    mobile: str,
    error_code: str | None,
    status_code: int,
) -> None:
    """Masked line in app.log; full receptor only in sensitive.log (never message body)."""
    _sms_logger.warning(
        "sms send failed context=%s provider=%s receptor=%s error=%s status=%s",
        context,
        provider,
        mask_mobile(mobile),
        error_code,
        status_code,
    )
    _sensitive_logger.info(
        "sms send failed context=%s provider=%s receptor_full=%s error=%s status=%s",
        context,
        provider,
        (mobile or "").strip(),
        error_code,
        status_code,
    )


class SmsError(Exception):
    def __init__(self, status_code: int, detail: str, *, code: str | None = None) -> None:
        self.status_code = status_code
        self.detail = detail
        self.code = code
        super().__init__(detail)


@dataclass(frozen=True)
class SmsSendResult:
    ok: bool
    message_id: str | None = None
    provider_status: int | None = None
    message: str | None = None


class SmsGateway(Protocol):
    provider_name: str

    def send_sms(
        self,
        *,
        receptor: str,
        message: str,
        sender: str | None = None,
    ) -> SmsSendResult: ...
