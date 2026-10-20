"""Kavenegar REST adapter. API key only from Settings/env — never logged."""

from __future__ import annotations

from typing import Any

import httpx

from app.services.sms.base import SmsError, SmsSendResult

_OK_STATUS = 200


class KavenegarGateway:
    provider_name = "kavenegar"

    def __init__(
        self,
        *,
        api_key: str,
        default_sender: str = "",
        client: httpx.Client | None = None,
        timeout: float = 20.0,
    ) -> None:
        self._api_key = api_key.strip()
        self._default_sender = (default_sender or "").strip()
        self._owns_client = client is None
        self._client = client or httpx.Client(timeout=timeout)
        self._api_base = f"https://api.kavenegar.com/v1/{self._api_key}"

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def send_sms(
        self,
        *,
        receptor: str,
        message: str,
        sender: str | None = None,
    ) -> SmsSendResult:
        receptor_clean = (receptor or "").strip()
        text = (message or "").strip()
        if not receptor_clean:
            raise SmsError(422, "شمارهٔ گیرنده نامعتبر است.", code="sms_bad_receptor")
        if not text:
            raise SmsError(422, "متن پیامک خالی است.", code="sms_empty")

        line = (sender or self._default_sender or "").strip() or None
        payload: dict[str, Any] = {
            "receptor": receptor_clean,
            "message": text,
        }
        if line:
            payload["sender"] = line

        try:
            response = self._client.post(
                f"{self._api_base}/sms/send.json",
                data=payload,
                headers={"Accept": "application/json"},
            )
            response.raise_for_status()
            body = response.json()
        except httpx.HTTPError as err:
            raise SmsError(502, "ارتباط با سرویس پیامک برقرار نشد.", code="sms_http") from err

        ret = body.get("return") if isinstance(body, dict) else None
        status_code = None
        status_msg = None
        if isinstance(ret, dict):
            status_code = ret.get("status")
            status_msg = ret.get("message")
        try:
            status_int = int(status_code) if status_code is not None else None
        except (TypeError, ValueError):
            status_int = None

        if status_int != _OK_STATUS:
            detail = "ارسال پیامک ناموفق بود."
            if isinstance(status_msg, str) and status_msg.strip():
                detail = f"ارسال پیامک ناموفق بود: {status_msg.strip()[:120]}"
            raise SmsError(502, detail, code="sms_provider_reject")

        message_id = None
        entries = body.get("entries") if isinstance(body, dict) else None
        if isinstance(entries, list) and entries:
            first = entries[0]
            if isinstance(first, dict) and first.get("messageid") is not None:
                message_id = str(first.get("messageid"))

        return SmsSendResult(
            ok=True,
            message_id=message_id,
            provider_status=status_int,
            message=str(status_msg) if status_msg else "ok",
        )
