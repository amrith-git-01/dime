"""Groq Whisper: audio bytes → transcript text."""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass

import httpx

from core.config import get_settings
from features.ai.voice_audio import (
    VoiceAudioNormalizeError,
    normalize_audio_for_transcription,
)

from .errors import TranscriptionError
from .groq_client import (
    groq_auth_headers,
    groq_transcriptions_url,
    raise_for_groq_status,
    require_groq_api_key,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class TranscriptionResult:
    text: str
    model: str


def _mime_for_upload(fmt: str) -> str:
    return "audio/mpeg" if fmt == "mp3" else "audio/wav"


def _extension_for_upload(fmt: str) -> str:
    return "mp3" if fmt == "mp3" else "wav"


async def _transcribe_with_model(
    *,
    audio_bytes: bytes,
    mime_type: str,
    file_name: str,
    model: str,
    timeout: float,
) -> str:
    require_groq_api_key()
    url = groq_transcriptions_url()
    headers = groq_auth_headers()

    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(
            url,
            headers=headers,
            data={"model": model},
            files={
                "file": (file_name, audio_bytes, mime_type),
            },
        )
    raise_for_groq_status(response, context=f"Groq Whisper ({model})")
    payload = response.json()
    text = payload.get("text") if isinstance(payload, dict) else None
    if not isinstance(text, str) or not text.strip():
        raise TranscriptionError(f"Groq Whisper ({model}) returned empty transcript")
    return text.strip()


async def transcribe_audio(
    audio_bytes: bytes,
    mime_type: str,
) -> TranscriptionResult:
    """Normalize audio, then transcribe with turbo → large-v3 fallback."""
    settings = get_settings()
    try:
        normalized, fmt = normalize_audio_for_transcription(audio_bytes, mime_type)
    except VoiceAudioNormalizeError as exc:
        raise TranscriptionError(str(exc)) from exc

    upload_mime = _mime_for_upload(fmt)
    upload_ext = _extension_for_upload(fmt)
    models = [
        settings.groq_whisper_primary,
        settings.groq_whisper_fallback,
    ]
    last_error: Exception | None = None
    timeout = max(settings.ai_timeout_seconds, 60.0)

    for model in models:
        if not model.strip():
            continue
        started = time.monotonic()
        logger.info(
            "[preprocess] whisper-start model=%s mime=%s bytes=%d",
            model,
            upload_mime,
            len(normalized),
        )
        try:
            text = await _transcribe_with_model(
                audio_bytes=normalized,
                mime_type=upload_mime,
                file_name=f"audio.{upload_ext}",
                model=model.strip(),
                timeout=timeout,
            )
            elapsed_ms = int((time.monotonic() - started) * 1000)
            logger.info(
                "[preprocess] whisper-done model=%s elapsed_ms=%d chars=%d excerpt=%r",
                model,
                elapsed_ms,
                len(text),
                text[:120],
            )
            return TranscriptionResult(text=text, model=model.strip())
        except Exception as exc:
            elapsed_ms = int((time.monotonic() - started) * 1000)
            logger.warning(
                "[preprocess] whisper-failed model=%s elapsed_ms=%d error=%s",
                model,
                elapsed_ms,
                exc,
            )
            last_error = exc
            continue

    msg = str(last_error) if last_error else "no Whisper models configured"
    raise TranscriptionError(f"All Groq Whisper models failed: {msg}")
