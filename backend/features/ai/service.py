"""Cloud AI receipt parsing service."""

from __future__ import annotations

import base64
import json
from datetime import datetime
from typing import Any

import httpx

from core.config import Settings
from features.ai.schemas import ReceiptParseResponse


class CloudReceiptParseService:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def parse_receipt(self, *, image_bytes: bytes, content_type: str) -> ReceiptParseResponse:
        if not self._settings.ai_api_key:
            raise RuntimeError("Server missing AI_API_KEY.")

        image_b64 = base64.b64encode(image_bytes).decode("ascii")
        data_uri = f"data:{content_type};base64,{image_b64}"

        prompt = (
            "Extract transaction details from this receipt image. "
            "Return JSON only with keys: merchant (string), amount (number), "
            "type ('debit'|'credit'), category (string|null), note (string|null), "
            "transaction_at (ISO datetime string). "
            "If date is missing, use current UTC datetime. "
            "No markdown, no extra keys."
        )

        payload = {
            "model": self._settings.ai_model,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": data_uri}},
                    ],
                }
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.1,
        }
        headers = {
            "Authorization": f"Bearer {self._settings.ai_api_key}",
            "Content-Type": "application/json",
        }

        try:
            async with httpx.AsyncClient(timeout=45) as client:
                response = await client.post(
                    self._settings.ai_base_url,
                    headers=headers,
                    json=payload,
                )
                response.raise_for_status()
        except Exception as exc:
            raise RuntimeError("Cloud AI request failed.") from exc

        try:
            data = response.json()
            content = data["choices"][0]["message"]["content"]
            parsed = self._extract_json_object(content)
            if "transaction_at" not in parsed or not parsed["transaction_at"]:
                parsed["transaction_at"] = datetime.utcnow().isoformat()
            return ReceiptParseResponse.model_validate(parsed)
        except Exception as exc:
            raise RuntimeError("Cloud AI returned invalid response.") from exc

    def _extract_json_object(self, content: Any) -> dict[str, Any]:
        if isinstance(content, list):
            text = "".join(
                part.get("text", "") for part in content if isinstance(part, dict)
            ).strip()
        else:
            text = str(content).strip()

        if text.startswith("```"):
            text = text.replace("```json", "").replace("```", "").strip()
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise ValueError("No JSON object in model output.")
        return json.loads(text[start : end + 1])

