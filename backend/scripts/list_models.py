"""List models for the DeepSeek + Groq pipeline.

Usage (from the ``backend`` directory):

    python -m scripts.list_models           # groq API catalog + configured DeepSeek ids
    python -m scripts.list_models groq      # Groq only
    python -m scripts.list_models --filter=whisper

Groq: ``GET /openai/v1/models`` (Whisper, Scout, etc.).

DeepSeek: no list call — prints ``AI_MODEL`` and ``AI_PARSE_FALLBACK`` from env.
"""

from __future__ import annotations

import asyncio
import sys
from dataclasses import dataclass

import httpx

from core.config import Settings, get_settings

REQUEST_TIMEOUT_SECONDS = 30.0


@dataclass(slots=True)
class ModelEntry:
    model_id: str
    role: str
    extra: str = ""


async def list_groq(settings: Settings, client: httpx.AsyncClient) -> list[ModelEntry]:
    if not settings.groq_api_key:
        raise RuntimeError("GROQ_API_KEY missing")
    url = f"{settings.groq_base_url.rstrip('/')}/models"
    headers = {"Authorization": f"Bearer {settings.groq_api_key}"}
    response = await client.get(url, headers=headers)
    response.raise_for_status()
    data = response.json()
    items = data.get("data", []) if isinstance(data, dict) else []
    entries: list[ModelEntry] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        model_id = str(item.get("id", ""))
        owned_by = str(item.get("owned_by", ""))
        role = "preprocess"
        if "whisper" in model_id.lower():
            role = "stt"
        elif "scout" in model_id.lower() or "llama-4" in model_id.lower():
            role = "ocr"
        extra = f"owned_by={owned_by}" if owned_by else ""
        entries.append(ModelEntry(model_id=model_id, role=role, extra=extra))
    return entries


def list_deepseek_configured(settings: Settings) -> list[ModelEntry]:
    entries: list[ModelEntry] = [
        ModelEntry(
            model_id=settings.ai_model,
            role="parse",
            extra="AI_MODEL (primary)",
        ),
    ]
    for raw in settings.ai_parse_fallback.split(","):
        item = raw.strip()
        if not item or ":" not in item:
            continue
        _, model_id = item.split(":", maxsplit=1)
        model_id = model_id.strip()
        if model_id and model_id != settings.ai_model:
            entries.append(
                ModelEntry(model_id=model_id, role="parse", extra="AI_PARSE_FALLBACK"),
            )
    return entries


def _print_pipeline_config(settings: Settings) -> None:
    print("\n=== PIPELINE (configured) ===")
    print(f"  STT primary:  {settings.groq_whisper_primary}")
    print(f"  STT fallback: {settings.groq_whisper_fallback}")
    print(f"  OCR:          {settings.groq_vision_ocr_model}")
    print(f"  Parse:        {settings.ai_model}")
    print(f"  Parse chain:  {settings.ai_parse_fallback}")


def _print_entries(provider: str, entries: list[ModelEntry], filter_term: str | None) -> None:
    print(f"\n=== {provider.upper()} ({len(entries)} entries) ===")
    if not entries:
        print("(none)")
        return
    rows = entries
    if filter_term:
        rows = [e for e in entries if filter_term.lower() in e.model_id.lower()]
        print(f"(filtered '{filter_term}': {len(rows)} match)")
    rows.sort(key=lambda e: e.model_id)
    id_w = max(len(e.model_id) for e in rows)
    role_w = max(len(e.role) for e in rows)
    for e in rows:
        extra = f"  {e.extra}" if e.extra else ""
        print(f"{e.model_id:<{id_w}}  {e.role:<{role_w}}{extra}")


async def main(argv: list[str]) -> int:
    settings = get_settings()
    selected = [a for a in argv[1:] if not a.startswith("--")] or ["groq", "deepseek"]
    filter_term: str | None = None
    for arg in argv[1:]:
        if arg.startswith("--filter="):
            filter_term = arg.split("=", 1)[1]

    _print_pipeline_config(settings)

    exit_code = 0
    timeout = httpx.Timeout(REQUEST_TIMEOUT_SECONDS, connect=10.0)

    if "deepseek" in selected:
        _print_entries("deepseek", list_deepseek_configured(settings), filter_term)

    if "groq" in selected:
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                groq_entries = await list_groq(settings, client)
            _print_entries("groq", groq_entries, filter_term)
        except Exception as exc:  # noqa: BLE001
            print(f"\n=== GROQ ===\nERROR: {type(exc).__name__}: {exc}")
            exit_code = 1

    return exit_code


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main(sys.argv)))
