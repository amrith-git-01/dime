from __future__ import annotations

import logging
import re
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_FROM_RE = re.compile(r"^\s*(.+?)\s*<([^>]+)>\s*$")


def parse_from_address(raw: str) -> tuple[str, str]:
    stripped = raw.strip()
    match = _FROM_RE.match(stripped)
    if match:
        return match.group(1).strip().strip('"'), match.group(2).strip()
    return "Dime", stripped


class BrevoClient:
    def __init__(self, api_key: str | None, from_raw: str) -> None:
        self._api_key = api_key.strip() if isinstance(api_key, str) and api_key.strip() else None
        self._from_name, self._from_email = parse_from_address(from_raw)

    @property
    def enabled(self) -> bool:
        return self._api_key is not None

    def send_html(
        self,
        *,
        to_email: str,
        to_name: str | None,
        subject: str,
        html: str,
        list_unsubscribe_url: str | None = None,
    ) -> str | None:
        if not self._api_key:
            logger.info("Brevo skipped: BREVO_API_KEY missing (to=%s)", to_email)
            return None

        payload: dict[str, Any] = {
            "sender": {"name": self._from_name, "email": self._from_email},
            "to": [{"email": to_email, **({"name": to_name} if to_name else {})}],
            "subject": subject,
            "htmlContent": html,
        }
        if list_unsubscribe_url:
            payload["headers"] = {
                "List-Unsubscribe": f"<{list_unsubscribe_url}>",
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            }

        response = httpx.post(
            "https://api.brevo.com/v3/smtp/email",
            headers={
                "api-key": self._api_key,
                "accept": "application/json",
                "content-type": "application/json",
            },
            json=payload,
            timeout=20.0,
        )
        if response.status_code not in (201, 202):
            logger.warning(
                "Brevo send failed status=%s body=%s",
                response.status_code,
                response.text[:500],
            )
            response.raise_for_status()
        data = response.json()
        message_id = data.get("messageId")
        return str(message_id) if message_id else "ok"
