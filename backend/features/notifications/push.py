from __future__ import annotations

import logging
from typing import Any, Callable

import httpx

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


def send_expo_push(
    *,
    tokens: list[str],
    title: str,
    body: str,
    data: dict[str, Any],
    on_invalid_token: Callable[[str], None],
) -> None:
    if not tokens:
        return

    messages = [
        {
            "to": token,
            "title": title,
            "body": body,
            "data": data,
            "sound": "default",
            "channelId": "dime-alerts",
        }
        for token in tokens
    ]

    try:
        with httpx.Client() as client:
            response = client.post(EXPO_PUSH_URL, json=messages, timeout=5.0)
    except Exception:
        logger.exception("Failed to send Expo push notifications")
        return

    try:
        if response.status_code != 200:
            logger.error(
                "Expo push API returned non-200 status code: %s",
                response.status_code,
            )
            return

        payload = response.json()
    except Exception:
        logger.exception("Failed to parse Expo push response")
        return

    tickets = payload.get("data")
    if not isinstance(tickets, list):
        return

    for token, ticket in zip(tokens, tickets):
        if not isinstance(ticket, dict):
            continue

        status = ticket.get("status")
        if status != "error":
            continue

        details = ticket.get("details") or {}
        error_code = None
        message = None
        if isinstance(details, dict):
            error_code = details.get("error")
            message = details.get("message")

        if error_code == "DeviceNotRegistered" or (
            isinstance(message, str) and "DeviceNotRegistered" in message
        ):
            try:
                on_invalid_token(token)
            except Exception:
                logger.exception(
                    "on_invalid_token callback failed for token %s",
                    token,
                )

