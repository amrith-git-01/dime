from __future__ import annotations

from typing import Any

from ..schemas import ParseMode
from .transaction_parse_prompts import (
    build_receipt_parse_prompt,
    build_sms_parse_prompt,
    build_voice_parse_prompt,
)


def build_parse_prompt(mode: ParseMode, payload: dict[str, Any]) -> str:
    categories = payload.get("allowed_categories")
    allowed_categories = (
        [x for x in categories if isinstance(x, str)]
        if isinstance(categories, list)
        else None
    )
    if mode == ParseMode.receipt:
        context = payload.get("text_context")
        return build_receipt_parse_prompt(
            context if isinstance(context, str) else None,
            allowed_categories=allowed_categories,
        )
    if mode == ParseMode.sms:
        context = payload.get("sms_text")
        return build_sms_parse_prompt(
            context if isinstance(context, str) else None,
            allowed_categories=allowed_categories,
        )
    context = payload.get("voice_text_hint")
    return build_voice_parse_prompt(
        context if isinstance(context, str) else None,
        allowed_categories=allowed_categories,
    )
