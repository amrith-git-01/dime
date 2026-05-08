from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, UTC
from decimal import Decimal
from typing import Any

from fastapi import HTTPException, status

from .schemas import (
    CounterpartyType,
    ExpenseType,
    ParseExpenseResult,
    ParseMode,
)


@dataclass(frozen=True)
class ModelCandidate:
    provider: str
    model: str


FALLBACKS: dict[ParseMode, list[ModelCandidate]] = {
    ParseMode.sms: [
        ModelCandidate("google", "gemma-3-4b"),
        ModelCandidate("google", "gemma-3-12b"),
        ModelCandidate("groq", "llama-3.1-8b"),
    ],
    ParseMode.receipt: [
        ModelCandidate("google", "gemma-4-26b"),
        ModelCandidate("google", "gemma-4-31b"),
        ModelCandidate("nvidia", "gemma-3n-e4b"),
    ],
    ParseMode.voice: [
        ModelCandidate("nvidia", "gemma-3n-e4b"),
        ModelCandidate("nvidia", "gemma-3n-e2b"),
    ],
}


class AIParseError(RuntimeError):
    pass


class AIOrchestratorService:
    async def parse_sms(self, text: str) -> ParseExpenseResult:
        return await self._run_with_fallback(
            mode=ParseMode.sms,
            payload={"text": text},
        )

    async def parse_receipt(self, image_bytes: bytes, mime_type: str) -> ParseExpenseResult:
        return await self._run_with_fallback(
            mode=ParseMode.receipt,
            payload={"image_bytes": image_bytes, "mime_type": mime_type},
        )

    async def parse_voice(self, audio_bytes: bytes, mime_type: str) -> ParseExpenseResult:
        return await self._run_with_fallback(
            mode=ParseMode.voice,
            payload={"audio_bytes": audio_bytes, "mime_type": mime_type},
        )

    async def _run_with_fallback(self, mode: ParseMode, payload: dict[str, Any]) -> ParseExpenseResult:
        last_error: Exception | None = None

        for candidate in FALLBACKS[mode]:
            try:
                raw = await self._call_provider(candidate, mode, payload)
                parsed = self._parse_and_validate(
                    raw,
                    model_name=candidate.model,
                    mode=mode,
                )
                return parsed
            except Exception as exc:
                last_error = exc
                continue

        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"AI_PARSE_UNAVAILABLE: mode={mode.value}, error={last_error}",
        )

    async def _call_provider(
        self,
        candidate: ModelCandidate,
        mode: ParseMode,
        payload: dict[str, Any],
    ) -> str:
        """
        Replace this stub with provider adapters:
        - google_client.parse(...)
        - nvidia_client.parse(...)
        - groq_client.parse(...)
        Must return JSON string matching ParseExpenseResult shape.
        """
        raise AIParseError(f"Provider not implemented: {candidate.provider}/{candidate.model}")

    def _parse_and_validate(
        self,
        raw_text: str,
        model_name: str,
        mode: ParseMode,
    ) -> ParseExpenseResult:
        try:
            data = json.loads(raw_text)
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

        return ParseExpenseResult(
            counterparty_name=data["counterparty_name"],
            counterparty_type=CounterpartyType(data["counterparty_type"]),
            amount=data["amount"],
            type=ExpenseType(data["type"]),
            date=datetime.fromisoformat(data["date"]) if data.get("date") else None,
            category=data["category"],
            note=data.get("note"),
            confidence=float(data["confidence"]),
            raw_model=data["raw_model"],
        )

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