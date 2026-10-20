"""Shared gateway adapter types — no provider-specific details."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


class GatewayError(Exception):
    def __init__(self, status_code: int, detail: str, *, code: str | None = None) -> None:
        self.status_code = status_code
        self.detail = detail
        self.code = code
        super().__init__(detail)


@dataclass(frozen=True)
class PaymentRequestResult:
    authority: str
    payment_url: str
    raw_code: int | None = None


@dataclass(frozen=True)
class PaymentVerifyResult:
    ok: bool
    ref_id: str | None
    raw_code: int | None
    already_verified: bool = False
    message: str | None = None


class PaymentGateway(Protocol):
    provider_name: str

    def request_payment(
        self,
        *,
        amount_toman: int,
        callback_url: str,
        description: str,
        metadata: dict | None = None,
    ) -> PaymentRequestResult: ...

    def verify_payment(
        self,
        *,
        amount_toman: int,
        authority: str,
    ) -> PaymentVerifyResult: ...
