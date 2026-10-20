"""Shared SMS adapter types — no provider-specific details."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


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
