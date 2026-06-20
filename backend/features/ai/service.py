from __future__ import annotations

import asyncio
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

from .preprocess import OcrError, TranscriptionError, extract_receipt_text, transcribe_audio
from .prompts import build_parse_prompt
from .schemas import (
    ExpenseType,
    ParseExpenseResult,
    ParseMode,
)


@dataclass(frozen=True)
class ModelCandidate:
    provider: str
    model: str


class AIParseError(RuntimeError):
    pass


class AIOrchestratorService:
    def __init__(self) -> None:
        self.settings = get_settings()

    async def parse_receipt(
        self,
        image_bytes: bytes,
        mime_type: str,
        allowed_categories: list[str],
        category_options: list[dict[str, str]],
    ) -> ParseExpenseResult:
        try:
            ocr = await extract_receipt_text(image_bytes, mime_type)
        except OcrError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(exc),
            ) from exc

        return await self._parse_with_deepseek(
            mode=ParseMode.receipt,
            payload={
                "text_context": ocr.text,
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
            transcript = await transcribe_audio(audio_bytes, mime_type)
        except TranscriptionError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(exc),
            ) from exc

        return await self._parse_with_deepseek(
            mode=ParseMode.voice,
            payload={
                "voice_text_hint": transcript.text,
                "allowed_categories": allowed_categories,
                "category_options": category_options,
            },
        )

    async def _parse_with_deepseek(
        self,
        mode: ParseMode,
        payload: dict[str, Any],
    ) -> ParseExpenseResult:
        last_error: Exception | None = None
        candidates = self._parse_candidates()
        total_budget_s = self.settings.ai_timeout_seconds
        per_candidate_s = total_budget_s / len(candidates)
        logger.info(
            "[ai] deepseek-parse-start mode=%s candidates=%s budget_s=%.1f per_candidate_s=%.1f",
            mode.value,
            [f"{c.provider}:{c.model}" for c in candidates],
            total_budget_s,
            per_candidate_s,
        )

        for candidate in candidates:
            started = time.monotonic()
            logger.info(
                "[ai] deepseek-call-start mode=%s model=%s timeout_s=%.1f",
                mode.value,
                candidate.model,
                per_candidate_s,
            )
            try:
                raw = await asyncio.wait_for(
                    self._call_deepseek(
                        candidate.model,
                        mode,
                        payload,
                        request_timeout=per_candidate_s,
                    ),
                    timeout=per_candidate_s,
                )
                elapsed_ms = int((time.monotonic() - started) * 1000)
                logger.info(
                    "[ai] deepseek-call-done mode=%s model=%s elapsed_ms=%d raw_chars=%d",
                    mode.value,
                    candidate.model,
                    elapsed_ms,
                    len(raw),
                )
                parsed = self._parse_and_validate(
                    raw,
                    model_name=candidate.model,
                    mode=mode,
                    allowed_categories=payload.get("allowed_categories"),
                    category_options=payload.get("category_options"),
                    source_text=self._payload_source_text(mode, payload),
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
            except TimeoutError as exc:
                elapsed_ms = int((time.monotonic() - started) * 1000)
                logger.warning(
                    "[ai] deepseek-call-timeout mode=%s model=%s elapsed_ms=%d budget_s=%.1f",
                    mode.value,
                    candidate.model,
                    elapsed_ms,
                    per_candidate_s,
                )
                last_error = exc
                continue
            except Exception as exc:
                elapsed_ms = int((time.monotonic() - started) * 1000)
                logger.warning(
                    "[ai] deepseek-call-failed mode=%s model=%s elapsed_ms=%d error=%s",
                    mode.value,
                    candidate.model,
                    elapsed_ms,
                    exc,
                )
                last_error = exc
                continue

        last_msg = str(last_error) or repr(last_error) if last_error else "no candidates"
        logger.error(
            "[ai] all-deepseek-failed mode=%s last_error=%s",
            mode.value,
            last_msg,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"AI_PARSE_UNAVAILABLE: mode={mode.value}, error={last_msg}",
        )

    async def _call_deepseek(
        self,
        model: str,
        mode: ParseMode,
        payload: dict[str, Any],
        *,
        request_timeout: float | None = None,
    ) -> str:
        settings = self.settings
        api_key = settings.ai_api_key
        if not api_key:
            raise AIParseError("DEEPSEEK_API_KEY / AI_API_KEY is missing")

        http_timeout = (
            request_timeout
            if request_timeout is not None
            else settings.ai_timeout_seconds
        )

        body: dict[str, Any] = {
            "model": model,
            "messages": [{"role": "user", "content": build_parse_prompt(mode, payload)}],
            "temperature": settings.ai_temperature,
            "response_format": {"type": "json_object"},
            "thinking": {"type": "disabled"},
        }
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=http_timeout) as client:
            response = await client.post(
                settings.ai_base_url,
                json=body,
                headers=headers,
            )
            self._raise_for_provider_status(response, provider="deepseek")
            data = response.json()
            try:
                return data["choices"][0]["message"]["content"]
            except (KeyError, IndexError, TypeError) as exc:
                raise AIParseError(f"DeepSeek response missing content: {data}") from exc

    def _raise_for_provider_status(self, response: httpx.Response, provider: str) -> None:
        if response.status_code < 400:
            return
        if response.status_code in (429, 500, 502, 503, 504):
            raise AIParseError(
                f"{provider} transient error {response.status_code}: {response.text[:400]}"
            )
        raise AIParseError(
            f"{provider} request failed {response.status_code}: {response.text[:400]}"
        )

    def _parse_candidates(self) -> list[ModelCandidate]:
        chain = self.settings.ai_parse_fallback.strip()
        if not chain:
            chain = f"deepseek:{self.settings.ai_model}"
        parsed = self._parse_chain(chain)
        if not parsed:
            raise AIParseError("No DeepSeek parse candidates configured")
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
            if provider != "deepseek":
                raise AIParseError(
                    f"Unsupported parse provider '{provider}' — only deepseek is allowed"
                )
            candidates.append(ModelCandidate(provider=provider, model=model))
        return candidates

    @staticmethod
    def _strip_json_fences(raw_text: str) -> str:
        text = raw_text.strip()
        if text.startswith("```"):
            text = text.lstrip("`")
            if text.lower().startswith("json"):
                text = text[4:]
            if text.endswith("```"):
                text = text[:-3]
        return text.strip()

    @staticmethod
    def _payload_source_text(_mode: ParseMode, _payload: dict[str, Any]) -> str | None:
        return None

    def _parse_and_validate(
        self,
        raw_text: str,
        model_name: str,
        mode: ParseMode,
        allowed_categories: object,
        category_options: object,
        source_text: str | None = None,
    ) -> ParseExpenseResult:
        cleaned = self._strip_json_fences(raw_text)
        try:
            data = json.loads(cleaned)
        except json.JSONDecodeError as exc:
            raise AIParseError(f"Model returned invalid JSON: {exc}") from exc

        if not data.get("date"):
            data["date"] = datetime.now(UTC).isoformat()
        data["raw_model"] = model_name
        self._coerce_counterparty_name(data, mode=mode, source_text=source_text)
        if not data.get("note"):
            data["note"] = self._build_default_note(
                mode=mode,
                counterparty_name=data.get("counterparty_name"),
            )

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

    def _coerce_counterparty_name(
        self,
        data: dict[str, Any],
        *,
        mode: ParseMode,
        source_text: str | None,
    ) -> None:
        del mode, source_text
        raw_name = data.get("counterparty_name")
        if isinstance(raw_name, str) and raw_name.strip():
            data["counterparty_name"] = raw_name.strip()
            return
        data["counterparty_name"] = "Unknown"

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

        try:
            return datetime.fromisoformat(value)
        except ValueError:
            pass

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
        if mode == ParseMode.receipt:
            return f"Auto-parsed from receipt for {name}."
        return f"Auto-parsed from voice input for {name}."
