"""Shared Groq OpenAI-compatible HTTP helpers for preprocess stage."""

from __future__ import annotations

import httpx

from core.config import get_settings

from .errors import PreprocessError


def require_groq_api_key() -> str:
    key = get_settings().groq_api_key
    if not key:
        raise PreprocessError("GROQ_API_KEY is missing")
    return key


def groq_chat_completions_url() -> str:
    base = get_settings().groq_base_url.rstrip("/")
    return f"{base}/chat/completions"


def groq_transcriptions_url() -> str:
    base = get_settings().groq_base_url.rstrip("/")
    return f"{base}/audio/transcriptions"


def groq_auth_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {require_groq_api_key()}"}


def raise_for_groq_status(response: httpx.Response, *, context: str) -> None:
    if response.status_code < 400:
        return
    detail = response.text[:400]
    if response.status_code in (429, 500, 502, 503, 504):
        raise PreprocessError(f"{context} transient HTTP {response.status_code}: {detail}")
    raise PreprocessError(f"{context} failed HTTP {response.status_code}: {detail}")
