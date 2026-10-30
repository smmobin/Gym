"""Fake SMS gateway for local demo — logs message, never calls an external API."""

from __future__ import annotations

import logging
import uuid

from app.services.sms.base import SmsError, SmsSendResult

logger = logging.getLogger("gym.sms.fake")


class FakeSmsGateway:
    """Pretend send succeeded; receptor + full body go to server logs only."""

    provider_name = "fake"

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

        message_id = f"fake-{uuid.uuid4().hex[:12]}"
        line = (sender or "").strip() or "—"
        logger.info(
            "FAKE SMS send ok | message_id=%s | receptor=%s | sender=%s | body=%s",
            message_id,
            receptor_clean,
            line,
            text,
        )
        return SmsSendResult(
            ok=True,
            message_id=message_id,
            provider_status=200,
            message="fake_ok",
        )
