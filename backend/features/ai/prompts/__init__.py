from __future__ import annotations

from typing import Any

from ..schemas import ParseMode
from .parse_receipt import build_receipt_parse_prompt
from .parse_sms import build_sms_parse_prompt
from .parse_voice import build_voice_parse_prompt


def build_parse_prompt(mode: ParseMode, payload: dict[str, Any]) -> str:
    categories = payload.get("allowed_categories")
    allowed_categories = (
        [x for x in categories if isinstance(x, str)]
        if isinstance(categories, list)
        else None
    )
    if mode == ParseMode.sms:
        sms_text = payload.get("text", "")
        return build_sms_parse_prompt(
            sms_text if isinstance(sms_text, str) else "",
            allowed_categories=allowed_categories,
        )
    if mode == ParseMode.receipt:
        context = payload.get("text_context")
        return build_receipt_parse_prompt(
            context if isinstance(context, str) else None,
            allowed_categories=allowed_categories,
        )
    context = payload.get("voice_text_hint")
    return build_voice_parse_prompt(
        context if isinstance(context, str) else None,
        allowed_categories=allowed_categories,
    )
