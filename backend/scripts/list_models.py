"""List models exposed by each provider's API for the current credentials.

Usage (from the ``backend`` directory):

    python -m scripts.list_models                # all providers
    python -m scripts.list_models google         # one provider
    python -m scripts.list_models google groq    # subset

Calls each provider's standard list endpoint:

* Google Generative Language API: ``GET /v1beta/models``
* Groq (OpenAI-compatible):       ``GET /openai/v1/models``
* NVIDIA Build (OpenAI-compatible): ``GET /v1/models``

Prints the model id and which generation methods the API advertises support
for. Use this to verify which model identifiers are actually callable with
your key before wiring them into ``AI_FALLBACK_*`` chains.
"""

from __future__ import annotations

import asyncio
import sys
from dataclasses import dataclass
from typing import Any

import httpx

from core.config import Settings, get_settings


REQUEST_TIMEOUT_SECONDS = 30.0


@dataclass(slots=True)
class ModelEntry:
    model_id: str
    methods: list[str]
    extra: str = ""


async def list_google(settings: Settings, client: httpx.AsyncClient) -> list[ModelEntry]:
    if not settings.google_ai_api_key:
        raise RuntimeError("GOOGLE_AI_API_KEY missing")
    url = f"{settings.google_ai_base_url.rstrip('/')}/models?pageSize=200"
    headers = {"x-goog-api-key": settings.google_ai_api_key}
    response = await client.get(url, headers=headers)
    response.raise_for_status()
    data = response.json()
    models = data.get("models", []) if isinstance(data, dict) else []
    entries: list[ModelEntry] = []
    for m in models:
        if not isinstance(m, dict):
            continue
        name = str(m.get("name", "")).removeprefix("models/")
        methods = [str(x) for x in (m.get("supportedGenerationMethods") or [])]
        entries.append(ModelEntry(model_id=name, methods=methods))
    return entries


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
    for m in items:
        if not isinstance(m, dict):
            continue
        owned_by = str(m.get("owned_by", ""))
        entries.append(
            ModelEntry(
                model_id=str(m.get("id", "")),
                methods=["chat.completions"],
                extra=f"owned_by={owned_by}" if owned_by else "",
            )
        )
    return entries


async def list_nvidia(settings: Settings, client: httpx.AsyncClient) -> list[ModelEntry]:
    if not settings.nvidia_api_key:
        raise RuntimeError("NVIDIA_API_KEY missing")
    url = f"{settings.nvidia_base_url.rstrip('/')}/models"
    headers = {"Authorization": f"Bearer {settings.nvidia_api_key}"}
    response = await client.get(url, headers=headers)
    response.raise_for_status()
    data = response.json()
    items = data.get("data", []) if isinstance(data, dict) else []
    entries: list[ModelEntry] = []
    for m in items:
        if not isinstance(m, dict):
            continue
        entries.append(
            ModelEntry(
                model_id=str(m.get("id", "")),
                methods=["chat.completions"],
                extra=f"owned_by={m.get('owned_by', '')}",
            )
        )
    return entries


def _print_entries(provider: str, entries: list[ModelEntry], filter_term: str | None) -> None:
    print(f"\n=== {provider.upper()} ({len(entries)} models) ===")
    if not entries:
        print("(none returned)")
        return
    rows = entries
    if filter_term:
        rows = [e for e in entries if filter_term.lower() in e.model_id.lower()]
        print(f"(filtered to '{filter_term}': {len(rows)} match)")
    rows.sort(key=lambda e: e.model_id)
    id_w = max((len(e.model_id) for e in rows), default=10)
    for e in rows:
        methods = ",".join(e.methods) if e.methods else "-"
        extra = f"  {e.extra}" if e.extra else ""
        print(f"{e.model_id:<{id_w}}  [{methods}]{extra}")


async def _run_one(
    provider: str,
    settings: Settings,
    client: httpx.AsyncClient,
) -> tuple[str, list[ModelEntry] | str]:
    try:
        if provider == "google":
            return provider, await list_google(settings, client)
        if provider == "groq":
            return provider, await list_groq(settings, client)
        if provider == "nvidia":
            return provider, await list_nvidia(settings, client)
        return provider, f"unknown provider '{provider}'"
    except httpx.HTTPStatusError as exc:
        body = exc.response.text
        return provider, f"HTTP {exc.response.status_code}: {body}"
    except Exception as exc:  # noqa: BLE001 - surface any error verbatim
        return provider, f"{type(exc).__name__}: {exc}"


async def main(argv: list[str]) -> int:
    settings = get_settings()
    selected = [a for a in argv[1:] if not a.startswith("--")] or ["google", "groq", "nvidia"]
    filter_term: str | None = None
    for a in argv[1:]:
        if a.startswith("--filter="):
            filter_term = a.split("=", 1)[1]

    timeout = httpx.Timeout(REQUEST_TIMEOUT_SECONDS, connect=10.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        results = await asyncio.gather(
            *(_run_one(p, settings, client) for p in selected)
        )

    exit_code = 0
    for provider, result in results:
        if isinstance(result, str):
            print(f"\n=== {provider.upper()} ===")
            print(f"ERROR: {result}")
            exit_code = 1
            continue
        _print_entries(provider, result, filter_term)
    return exit_code


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main(sys.argv)))
