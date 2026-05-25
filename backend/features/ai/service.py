from __future__ import annotations

import asyncio
import base64
import json
import logging
import time
from dataclasses import dataclass
from datetime import datetime, UTC
from decimal import Decimal
from typing import Any

import httpx
from fastapi import HTTPException, status
from pydantic import ValidationError

from core.config import get_settings

logger = logging.getLogger(__name__)

from .prompts import build_parse_prompt
from .schemas import (
    ExpenseType,
    ParseExpenseResult,
    ParseMode,
)
from .voice_audio import VoiceAudioNormalizeError, normalize_voice_audio_for_nvidia


@dataclass(frozen=True)
class ModelCandidate:
    provider: str
    model: str


class AIParseError(RuntimeError):
    pass


class AIOrchestratorService:
    def __init__(self) -> None:
        self.settings = get_settings()

    async def parse_sms(
        self,
        text: str,
        allowed_categories: list[str],
        category_options: list[dict[str, str]],
    ) -> ParseExpenseResult:
        return await self._run_with_fallback(
            mode=ParseMode.sms,
            payload={
                "text": text,
                "allowed_categories": allowed_categories,
                "category_options": category_options,
            },
        )

    async def parse_receipt(
        self,
        image_bytes: bytes,
        mime_type: str,
        allowed_categories: list[str],
        category_options: list[dict[str, str]],
    ) -> ParseExpenseResult:
        return await self._run_with_fallback(
            mode=ParseMode.receipt,
            payload={
                "image_bytes": image_bytes,
                "mime_type": mime_type,
                "allowed_categories": allowed_categories,
                "category_options": category_options,
            },
        )

    async def parse_voice(
        self,
        audio_bytes: bytes,
        mime_type: str,
        allowed_categories: list[str],
        category_options: list[dict[str, str]],
    ) -> ParseExpenseResult:
        try:
            normalized, fmt = normalize_voice_audio_for_nvidia(audio_bytes, mime_type)
        except VoiceAudioNormalizeError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(exc),
            ) from exc
        out_mime = "audio/wav" if fmt == "wav" else "audio/mpeg"
        return await self._run_with_fallback(
            mode=ParseMode.voice,
            payload={
                "audio_bytes": normalized,
                "mime_type": out_mime,
                "allowed_categories": allowed_categories,
                "category_options": category_options,
            },
        )

    async def _run_with_fallback(self, mode: ParseMode, payload: dict[str, Any]) -> ParseExpenseResult:
        last_error: Exception | None = None
        candidates = self._fallbacks_for_mode(mode)
        logger.info(
            "[ai] run-with-fallback mode=%s candidates=%s",
            mode.value,
            [f"{c.provider}:{c.model}" for c in candidates],
        )

        for candidate in candidates:
            started = time.monotonic()
            logger.info(
                "[ai] provider-call-start mode=%s provider=%s model=%s",
                mode.value,
                candidate.provider,
                candidate.model,
            )
            try:
                raw = await self._call_provider(candidate, mode, payload)
                elapsed_ms = int((time.monotonic() - started) * 1000)
                logger.info(
                    "[ai] provider-call-done mode=%s provider=%s model=%s "
                    "elapsed_ms=%d raw_chars=%d raw_excerpt=%r",
                    mode.value,
                    candidate.provider,
                    candidate.model,
                    elapsed_ms,
                    len(raw),
                    raw[:300],
                )
                parsed = self._parse_and_validate(
                    raw,
                    model_name=candidate.model,
                    mode=mode,
                    allowed_categories=payload.get("allowed_categories"),
                    category_options=payload.get("category_options"),
                )
                logger.info(
                    "[ai] parse-validated mode=%s model=%s amount=%s type=%s "
                    "counterparty_name=%s category=%s confidence=%s",
                    mode.value,
                    candidate.model,
                    parsed.amount,
                    parsed.type.value,
                    parsed.counterparty_name,
                    parsed.category,
                    parsed.confidence,
                )
                return parsed
            except Exception as exc:
                elapsed_ms = int((time.monotonic() - started) * 1000)
                exc_msg = str(exc) or repr(exc)
                logger.warning(
                    "[ai] provider-call-failed mode=%s provider=%s model=%s "
                    "elapsed_ms=%d error_type=%s error=%s",
                    mode.value,
                    candidate.provider,
                    candidate.model,
                    elapsed_ms,
                    type(exc).__name__,
                    exc_msg,
                )
                last_error = exc
                continue

        last_msg = str(last_error) or repr(last_error) if last_error else "no candidates"
        logger.error(
            "[ai] all-providers-failed mode=%s last_error_type=%s last_error=%s",
            mode.value,
            type(last_error).__name__ if last_error else "None",
            last_msg,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"AI_PARSE_UNAVAILABLE: mode={mode.value}, error={last_msg}",
        )

    async def _call_provider(
        self,
        candidate: ModelCandidate,
        mode: ParseMode,
        payload: dict[str, Any],
    ) -> str:
        if candidate.provider == "google":
            return await self._call_google(candidate.model, mode, payload)
        if candidate.provider == "groq":
            return await self._call_groq(candidate.model, mode, payload)
        if candidate.provider == "nvidia":
            return await self._call_nvidia(candidate.model, mode, payload)
        raise AIParseError(f"Unknown provider: {candidate.provider}")

    async def _call_google(
        self,
        model: str,
        mode: ParseMode,
        payload: dict[str, Any],
    ) -> str:
        settings = self.settings
        if not settings.google_ai_api_key:
            raise AIParseError("GOOGLE_AI_API_KEY is missing")

        model_id = self._google_model_id(model)
        url = f"{settings.google_ai_base_url.rstrip('/')}/models/{model_id}:generateContent"

        content_parts: list[dict[str, Any]] = [{"text": build_parse_prompt(mode, payload)}]
        if mode == ParseMode.receipt:
            image_bytes = payload.get("image_bytes")
            if not isinstance(image_bytes, (bytes, bytearray)):
                raise AIParseError("Missing image bytes for receipt parse")
            mime_type = payload.get("mime_type") or "image/jpeg"
            content_parts.append(
                {
                    "inline_data": {
                        "mime_type": mime_type,
                        "data": base64.b64encode(image_bytes).decode("utf-8"),
                    }
                }
            )

        generation_config: dict[str, Any] = {"temperature": settings.ai_temperature}
        if self._google_supports_response_mime_json(model_id):
            generation_config["responseMimeType"] = "application/json"
        body = {
            "contents": [{"role": "user", "parts": content_parts}],
            "generationConfig": generation_config,
        }
        headers = {
            "x-goog-api-key": settings.google_ai_api_key,
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=settings.ai_timeout_seconds) as client:
            response = await client.post(url, json=body, headers=headers)
            self._raise_for_provider_status(response, provider="google")
            data = response.json()
            try:
                return data["candidates"][0]["content"]["parts"][0]["text"]
            except (KeyError, IndexError, TypeError) as exc:
                raise AIParseError(f"Google response missing text: {data}") from exc

    async def _call_groq(
        self,
        model: str,
        mode: ParseMode,
        payload: dict[str, Any],
    ) -> str:
        settings = self.settings
        if not settings.groq_api_key:
            raise AIParseError("GROQ_API_KEY is missing")
        if mode != ParseMode.sms:
            raise AIParseError(f"Groq not configured for mode={mode.value}")

        model_id = self._groq_model_id(model)
        body = {
            "model": model_id,
            "messages": [{"role": "user", "content": build_parse_prompt(mode, payload)}],
            "temperature": settings.ai_temperature,
            "response_format": {"type": "json_object"},
        }
        headers = {"Authorization": f"Bearer {settings.groq_api_key}"}
        url = f"{settings.groq_base_url}/chat/completions"

        async with httpx.AsyncClient(timeout=settings.ai_timeout_seconds) as client:
            response = await client.post(url, json=body, headers=headers)
            self._raise_for_provider_status(response, provider="groq")
            data = response.json()
            try:
                return data["choices"][0]["message"]["content"]
            except (KeyError, IndexError, TypeError) as exc:
                raise AIParseError(f"Groq response missing content: {data}") from exc

    async def _call_nvidia(
        self,
        model: str,
        mode: ParseMode,
        payload: dict[str, Any],
    ) -> str:
        settings = self.settings
        if not settings.nvidia_api_key:
            raise AIParseError("NVIDIA_API_KEY is missing")

        model_id = self._nvidia_model_id(model)
        prompt = build_parse_prompt(mode, payload)
        content_parts: list[dict[str, Any]] = [{"type": "text", "text": prompt}]

        if mode == ParseMode.receipt:
            image_bytes = payload.get("image_bytes")
            if not isinstance(image_bytes, (bytes, bytearray)):
                raise AIParseError("Missing image bytes for receipt parse")
            mime_type = payload.get("mime_type") or "image/jpeg"
            image_data = base64.b64encode(image_bytes).decode("utf-8")
            content_parts.append(
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:{mime_type};base64,{image_data}"},
                }
            )
        elif mode == ParseMode.voice:
            audio_bytes = payload.get("audio_bytes")
            if not isinstance(audio_bytes, (bytes, bytearray)):
                raise AIParseError("Missing audio bytes for voice parse")
            mime_type = payload.get("mime_type") or "audio/wav"
            audio_data = base64.b64encode(audio_bytes).decode("utf-8")
            nv_audio_fmt = self._nvidia_voice_format(mime_type)
            content_parts.append(
                {
                    "type": "input_audio",
                    "input_audio": {"data": audio_data, "format": nv_audio_fmt},
                }
            )

        body = {
            "model": model_id,
            "messages": [{"role": "user", "content": content_parts}],
            "temperature": settings.ai_temperature,
            "response_format": {"type": "json_object"},
        }
        headers = {"Authorization": f"Bearer {settings.nvidia_api_key}"}
        url = f"{settings.nvidia_base_url.rstrip('/')}/chat/completions"
        per_req = httpx.Timeout(120.0, connect=15.0)
        deadline = time.monotonic() + float(settings.ai_timeout_seconds)

        async with httpx.AsyncClient(timeout=per_req) as client:
            return await self._nvidia_invoke_chat_completion(
                client=client,
                url=url,
                headers=headers,
                body=body,
                deadline=deadline,
            )

    def _raise_for_provider_status(self, response: httpx.Response, provider: str) -> None:
        if response.status_code < 400:
            return
        if response.status_code in (429, 500, 502, 503, 504):
            raise AIParseError(
                f"{provider} transient error {response.status_code}: {response.text[:400]}"
            )
        raise AIParseError(f"{provider} request failed {response.status_code}: {response.text[:400]}")

    def _google_model_id(self, model: str) -> str:
        settings = self.settings
        mapping = {
            "gemma-4-26b": settings.google_model_gemma_4_26b,
            "gemma-4-31b": settings.google_model_gemma_4_31b,
        }
        return mapping.get(model, model)

    @staticmethod
    def _google_supports_response_mime_json(model_id: str) -> bool:
        """Gemma 3 and 3n on the Generative Language API reject ``responseMimeType``.

        Gemma 4 and Gemini 2.x accept structured output config.
        """
        lowered = model_id.lower()
        if lowered.startswith("gemma-3"):
            return False
        return True

    def _groq_model_id(self, model: str) -> str:
        settings = self.settings
        mapping = {
            "llama-3.1-8b": settings.groq_model_llama_3_1_8b,
        }
        return mapping.get(model, model)

    def _nvidia_model_id(self, model: str) -> str:
        settings = self.settings
        mapping = {
            "gemma-3n-e4b": settings.nvidia_model_gemma_3n_e4b,
            "gemma-3n-e2b": settings.nvidia_model_gemma_3n_e2b,
            "gemma-3-4b": settings.nvidia_model_gemma_3_4b,
            "gemma-3-12b": settings.nvidia_model_gemma_3_12b,
            "gemma-3-27b": settings.nvidia_model_gemma_3_27b,
        }
        return mapping.get(model, model)

    def _fallbacks_for_mode(self, mode: ParseMode) -> list[ModelCandidate]:
        if mode == ParseMode.sms:
            chain = self.settings.ai_fallback_sms
        elif mode == ParseMode.receipt:
            chain = self.settings.ai_fallback_receipt
        else:
            chain = self.settings.ai_fallback_voice
        parsed = self._parse_chain(chain)
        if not parsed:
            raise AIParseError(f"No fallback candidates configured for mode={mode.value}")
        return parsed

    def _parse_chain(self, chain: str) -> list[ModelCandidate]:
        candidates: list[ModelCandidate] = []
        for raw_item in chain.split(","):
            item = raw_item.strip()
            if not item:
                continue
            provider, separator, model = item.partition(":")
            provider = provider.strip().lower()
            model = model.strip()
            if separator != ":" or not provider or not model:
                raise AIParseError(f"Invalid fallback chain entry: '{item}'")
            candidates.append(ModelCandidate(provider=provider, model=model))
        return candidates

    def _nvidia_voice_format(self, mime_type: str) -> str:
        """NVIDIA Gemma 3n infer API: audio must be ``wav`` or ``mp3`` only."""
        lowered = mime_type.lower()
        if "wav" in lowered:
            return "wav"
        if "mp3" in lowered or "mpeg" in lowered:
            return "mp3"
        raise AIParseError(
            f"Unsupported audio MIME for NVIDIA after normalization: {mime_type!r}"
        )

    def _nvidia_extract_message_text(self, data: dict[str, Any]) -> str:
        try:
            text = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise AIParseError(f"NVIDIA response missing content: {data}") from exc
        if not isinstance(text, str):
            raise AIParseError(f"NVIDIA content is not text: {data}")
        return text

    def _nvidia_async_request_id(self, response: httpx.Response) -> str:
        try:
            payload = response.json()
        except json.JSONDecodeError:
            payload = {}
        if isinstance(payload, dict):
            for key in ("request_id", "requestId", "id"):
                val = payload.get(key)
                if isinstance(val, str) and val.strip():
                    return val.strip()
        raise AIParseError(
            f"NVIDIA 202 missing request id in body: {response.text[:400]}"
        )

    async def _nvidia_invoke_chat_completion(
        self,
        client: httpx.AsyncClient,
        url: str,
        headers: dict[str, str],
        body: dict[str, Any],
        deadline: float,
    ) -> str:
        response = await client.post(url, json=body, headers=headers)

        if response.status_code == 202:
            request_id = self._nvidia_async_request_id(response)
            status_url = f"{self.settings.nvidia_base_url.rstrip('/')}/status/{request_id}"
            while time.monotonic() < deadline:
                poll = await client.get(status_url, headers=headers)
                if poll.status_code == 200:
                    return self._nvidia_extract_message_text(poll.json())
                if poll.status_code == 202:
                    await asyncio.sleep(0.45)
                    continue
                self._raise_for_provider_status(poll, provider="nvidia")
            raise AIParseError("NVIDIA status polling exceeded AI_TIMEOUT_SECONDS")

        self._raise_for_provider_status(response, provider="nvidia")
        return self._nvidia_extract_message_text(response.json())

    @staticmethod
    def _strip_json_fences(raw_text: str) -> str:
        """Remove markdown ```json ... ``` fences models sometimes wrap JSON in."""
        text = raw_text.strip()
        if text.startswith("```"):
            text = text.lstrip("`")
            if text.lower().startswith("json"):
                text = text[4:]
            if text.endswith("```"):
                text = text[:-3]
        return text.strip()

    def _parse_and_validate(
        self,
        raw_text: str,
        model_name: str,
        mode: ParseMode,
        allowed_categories: object,
        category_options: object,
    ) -> ParseExpenseResult:
        cleaned = self._strip_json_fences(raw_text)
        try:
            data = json.loads(cleaned)
        except json.JSONDecodeError as exc:
            raise AIParseError(f"Model returned invalid JSON: {exc}") from exc

        # Defensive defaults
        if not data.get("date"):
            data["date"] = datetime.now(UTC).isoformat()
        if not data.get("raw_model"):
            data["raw_model"] = model_name
        if not data.get("note"):
            data["note"] = self._build_default_note(
                mode=mode,
                counterparty_name=data.get("counterparty_name"),
            )

        # Cast amount safely
        if "amount" in data:
            data["amount"] = Decimal(str(data["amount"]))
        if isinstance(data.get("counterparty_type"), str):
            stripped = data["counterparty_type"].strip()
            allowed_cp = frozenset({"merchant", "person", "self_transfer", "unknown"})
            data["counterparty_type"] = stripped if stripped in allowed_cp else "merchant"
        else:
            data["counterparty_type"] = "merchant"
        raw_category = data.get("category")
        data["category"] = self._normalize_category(raw_category, allowed_categories)
        data["category_id"] = self._resolve_category_id(data["category"], category_options)
        if data["category_id"] is None and isinstance(raw_category, str):
            coerced = self._category_name_from_id(raw_category, category_options)
            if coerced is not None:
                data["category"] = coerced
                data["category_id"] = self._resolve_category_id(coerced, category_options)
        try:
            return ParseExpenseResult(
                counterparty_name=data["counterparty_name"],
                counterparty_type=data["counterparty_type"],
                amount=data["amount"],
                type=ExpenseType(data["type"]),
                date=self._parse_date(data.get("date")),
                category=data["category"],
                category_id=data.get("category_id"),
                note=data.get("note"),
                confidence=float(data["confidence"]),
                raw_model=data["raw_model"],
            )
        except (KeyError, ValueError, ValidationError) as exc:
            raise AIParseError(f"Parsed payload validation failed: {data}") from exc

    def _normalize_category(self, raw_value: object, allowed: object) -> str:
        categories = (
            [x.strip() for x in allowed if isinstance(x, str) and x.strip()]
            if isinstance(allowed, list)
            else []
        )
        if not categories:
            return str(raw_value).strip() if isinstance(raw_value, str) and raw_value.strip() else "Other"

        normalized_lookup = {c.lower(): c for c in categories}
        if isinstance(raw_value, str):
            key = raw_value.strip().lower()
            if key in normalized_lookup:
                return normalized_lookup[key]

        if "other" in normalized_lookup:
            return normalized_lookup["other"]
        return categories[0]

    def _resolve_category_id(self, category_name: str, category_options: object) -> str | None:
        if not isinstance(category_options, list):
            return None
        wanted = category_name.strip().lower()
        for item in category_options:
            if not isinstance(item, dict):
                continue
            name = item.get("name")
            cid = item.get("id")
            if isinstance(name, str) and isinstance(cid, str) and name.strip().lower() == wanted:
                return cid
        return None

    def _category_name_from_id(self, raw_value: str, category_options: object) -> str | None:
        if not isinstance(category_options, list):
            return None
        wanted = raw_value.strip().lower()
        for item in category_options:
            if not isinstance(item, dict):
                continue
            cid = item.get("id")
            name = item.get("name")
            if isinstance(cid, str) and isinstance(name, str) and cid.strip().lower() == wanted:
                return name.strip()
        return None

    def _parse_date(self, raw: object) -> datetime | None:
        if raw is None:
            return None
        if isinstance(raw, datetime):
            return raw
        if not isinstance(raw, str):
            return None

        value = raw.strip()
        if not value:
            return None

        # ISO first
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            pass

        # Common non-ISO formats models often return.
        for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d", "%Y-%m-%d"):
            try:
                return datetime.strptime(value, fmt).replace(tzinfo=UTC)
            except ValueError:
                continue
        return None

    def _build_default_note(self, mode: ParseMode, counterparty_name: object) -> str:
        name = (
            str(counterparty_name).strip()
            if isinstance(counterparty_name, str) and counterparty_name.strip()
            else "counterparty"
        )
        if mode == ParseMode.sms:
            return f"Auto-parsed from SMS/notification for {name}."
        if mode == ParseMode.receipt:
            return f"Auto-parsed from receipt for {name}."
        return f"Auto-parsed from voice input for {name}."