"""Zarinpal v4 REST adapter (sandbox + production). Amounts in API are Rials."""

from __future__ import annotations

from typing import Any

import httpx

from app.services.payment_gateway.base import (
    GatewayError,
    PaymentRequestResult,
    PaymentVerifyResult,
)

# Official docs: 1 Toman = 10 Rials for Zarinpal amount field.
_TOMAN_TO_RIAL = 10
_REQUEST_OK = 100
_VERIFY_OK = 100
_VERIFY_ALREADY = 101


def toman_to_rial(amount_toman: int) -> int:
    return int(amount_toman) * _TOMAN_TO_RIAL


class ZarinpalGateway:
    provider_name = "zarinpal"

    def __init__(
        self,
        *,
        merchant_id: str,
        sandbox: bool = True,
        client: httpx.Client | None = None,
        timeout: float = 20.0,
    ) -> None:
        self._merchant_id = merchant_id.strip()
        self._sandbox = sandbox
        self._owns_client = client is None
        self._client = client or httpx.Client(timeout=timeout)
        if sandbox:
            self._api_base = "https://sandbox.zarinpal.com"
            self._start_base = "https://sandbox.zarinpal.com/pg/StartPay"
        else:
            self._api_base = "https://payment.zarinpal.com"
            self._start_base = "https://www.zarinpal.com/pg/StartPay"

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def request_payment(
        self,
        *,
        amount_toman: int,
        callback_url: str,
        description: str,
        metadata: dict | None = None,
    ) -> PaymentRequestResult:
        if amount_toman < 100:
            raise GatewayError(422, "حداقل مبلغ پرداخت آنلاین ۱۰۰ تومان است.")
        payload: dict[str, Any] = {
            "merchant_id": self._merchant_id,
            "amount": toman_to_rial(amount_toman),
            "callback_url": callback_url,
            "description": description[:255] or "پرداخت باشگاه",
        }
        if metadata:
            payload["metadata"] = metadata
        try:
            response = self._client.post(
                f"{self._api_base}/pg/v4/payment/request.json",
                json=payload,
                headers={"Accept": "application/json", "Content-Type": "application/json"},
            )
            response.raise_for_status()
            body = response.json()
        except httpx.HTTPError as err:
            raise GatewayError(502, "ارتباط با درگاه پرداخت برقرار نشد.") from err

        data = body.get("data") or {}
        code = data.get("code")
        authority = data.get("authority")
        if code != _REQUEST_OK or not authority:
            errors = body.get("errors") or {}
            detail = "درگاه پرداخت درخواست را نپذیرفت."
            if isinstance(errors, dict) and errors.get("message"):
                detail = str(errors["message"])
            raise GatewayError(502, detail, code=str(code) if code is not None else None)

        return PaymentRequestResult(
            authority=str(authority),
            payment_url=f"{self._start_base}/{authority}",
            raw_code=int(code) if code is not None else None,
        )

    def verify_payment(
        self,
        *,
        amount_toman: int,
        authority: str,
    ) -> PaymentVerifyResult:
        payload = {
            "merchant_id": self._merchant_id,
            "amount": toman_to_rial(amount_toman),
            "authority": authority,
        }
        try:
            response = self._client.post(
                f"{self._api_base}/pg/v4/payment/verify.json",
                json=payload,
                headers={"Accept": "application/json", "Content-Type": "application/json"},
            )
            response.raise_for_status()
            body = response.json()
        except httpx.HTTPError as err:
            raise GatewayError(502, "تأیید پرداخت از درگاه ممکن نشد.") from err

        data = body.get("data") or {}
        code = data.get("code")
        ref_id = data.get("ref_id")
        message = data.get("message")
        if code == _VERIFY_OK:
            return PaymentVerifyResult(
                ok=True,
                ref_id=str(ref_id) if ref_id is not None else None,
                raw_code=int(code),
                already_verified=False,
                message=str(message) if message else None,
            )
        if code == _VERIFY_ALREADY:
            return PaymentVerifyResult(
                ok=True,
                ref_id=str(ref_id) if ref_id is not None else None,
                raw_code=int(code),
                already_verified=True,
                message=str(message) if message else None,
            )
        return PaymentVerifyResult(
            ok=False,
            ref_id=None,
            raw_code=int(code) if code is not None else None,
            already_verified=False,
            message=str(message) if message else "پرداخت تأیید نشد.",
        )
