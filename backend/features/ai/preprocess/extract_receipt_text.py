"""Groq Llama 4 Scout: receipt image → plain OCR text."""

from __future__ import annotations

import base64
import logging
import time
from dataclasses import dataclass

import httpx

from core.config import get_settings

from .errors import OcrError
from .groq_client import (
    groq_auth_headers,
    groq_chat_completions_url,
    raise_for_groq_status,
    require_groq_api_key,
)
from .prompts import build_receipt_ocr_prompt

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class OcrResult:
    text: str
    model: str


async def extract_receipt_text(
    image_bytes: bytes,
    mime_type: str,
) -> OcrResult:
    settings = get_settings()
    model = settings.groq_vision_ocr_model.strip()
    if not model:
        raise OcrError("GROQ_VISION_OCR_MODEL is not configured")

    require_groq_api_key()
    image_mime = mime_type if mime_type.startswith("image/") else "image/jpeg"
    image_b64 = base64.b64encode(image_bytes).decode("utf-8")
    prompt = build_receipt_ocr_prompt()

    body = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{image_mime};base64,{image_b64}"},
                    },
                ],
            }
        ],
        "temperature": 0.0,
        "max_tokens": 2048,
    }
    headers = {**groq_auth_headers(), "Content-Type": "application/json"}
    url = groq_chat_completions_url()
    timeout = max(settings.ai_timeout_seconds, 45.0)

    started = time.monotonic()
    logger.info(
        "[preprocess] ocr-start model=%s mime=%s bytes=%d",
        model,
        image_mime,
        len(image_bytes),
    )

    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(url, json=body, headers=headers)

    raise_for_groq_status(response, context=f"Groq vision OCR ({model})")
    data = response.json()
    try:
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise OcrError(f"Groq OCR response missing content: {data}") from exc

    if isinstance(content, list):
        text = "".join(
            part.get("text", "") for part in content if isinstance(part, dict)
        ).strip()
    else:
        text = str(content).strip()

    if not text:
        raise OcrError(f"Groq OCR ({model}) returned empty text")

    elapsed_ms = int((time.monotonic() - started) * 1000)
    logger.info(
        "[preprocess] ocr-done model=%s elapsed_ms=%d chars=%d excerpt=%r",
        model,
        elapsed_ms,
        len(text),
        text[:120],
    )
    return OcrResult(text=text, model=model)
