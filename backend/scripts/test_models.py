"""Connection test for every AI model used by the pipeline.

Usage (from the ``backend`` directory):

    python -m scripts.test_models

Sends a tiny "reply with OK" prompt to each provider/model defined in the
fallback chains and reports status, latency, and a short response excerpt.
Authentication and model availability problems show up immediately as 4xx/5xx
errors. No image, audio, or database access is touched.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from typing import Any

import httpx

from core.config import Settings, get_settings
from features.ai.service import AIOrchestratorService


PING_PROMPT = "Reply with the single word: OK"
PROBE_TIMEOUT_SECONDS = 30.0


@dataclass(slots=True)
class ProbeResult:
    provider: str
    alias: str
    model_id: str
    ok: bool
    elapsed_ms: int
    detail: str


async def _probe_google(
    settings: Settings,
    alias: str,
    model_id: str,
    client: httpx.AsyncClient,
) -> ProbeResult:
    start = time.monotonic()
    if not settings.google_ai_api_key:
        return ProbeResult("google", alias, model_id, False, 0, "GOOGLE_AI_API_KEY missing")

    url = f"{settings.google_ai_base_url.rstrip('/')}/models/{model_id}:generateContent"
    body: dict[str, Any] = {
        "contents": [{"role": "user", "parts": [{"text": PING_PROMPT}]}],
        "generationConfig": {"temperature": 0.0},
    }
    if AIOrchestratorService._google_supports_response_mime_json(model_id):
        body["generationConfig"]["responseMimeType"] = "text/plain"

    headers = {
        "x-goog-api-key": settings.google_ai_api_key,
        "Content-Type": "application/json",
    }
    return await _execute_probe(
        provider="google",
        alias=alias,
        model_id=model_id,
        start=start,
        client=client,
        method="POST",
        url=url,
        headers=headers,
        json_body=body,
        text_extractor=_extract_google_text,
    )


async def _probe_groq(
    settings: Settings,
    alias: str,
    model_id: str,
    client: httpx.AsyncClient,
) -> ProbeResult:
    start = time.monotonic()
    if not settings.groq_api_key:
        return ProbeResult("groq", alias, model_id, False, 0, "GROQ_API_KEY missing")

    url = f"{settings.groq_base_url.rstrip('/')}/chat/completions"
    body = {
        "model": model_id,
        "messages": [{"role": "user", "content": PING_PROMPT}],
        "temperature": 0.0,
        "max_tokens": 8,
    }
    headers = {"Authorization": f"Bearer {settings.groq_api_key}"}
    return await _execute_probe(
        provider="groq",
        alias=alias,
        model_id=model_id,
        start=start,
        client=client,
        method="POST",
        url=url,
        headers=headers,
        json_body=body,
        text_extractor=_extract_openai_text,
    )


async def _probe_nvidia(
    settings: Settings,
    alias: str,
    model_id: str,
    client: httpx.AsyncClient,
) -> ProbeResult:
    start = time.monotonic()
    if not settings.nvidia_api_key:
        return ProbeResult("nvidia", alias, model_id, False, 0, "NVIDIA_API_KEY missing")

    url = f"{settings.nvidia_base_url.rstrip('/')}/chat/completions"
    body = {
        "model": model_id,
        "messages": [
            {"role": "user", "content": [{"type": "text", "text": PING_PROMPT}]}
        ],
        "temperature": 0.0,
        "max_tokens": 8,
    }
    headers = {"Authorization": f"Bearer {settings.nvidia_api_key}"}
    return await _execute_probe(
        provider="nvidia",
        alias=alias,
        model_id=model_id,
        start=start,
        client=client,
        method="POST",
        url=url,
        headers=headers,
        json_body=body,
        text_extractor=_extract_openai_text,
    )


async def _execute_probe(
    *,
    provider: str,
    alias: str,
    model_id: str,
    start: float,
    client: httpx.AsyncClient,
    method: str,
    url: str,
    headers: dict[str, str],
    json_body: dict[str, Any],
    text_extractor,
) -> ProbeResult:
    try:
        response = await client.request(method, url, headers=headers, json=json_body)
    except httpx.HTTPError as exc:
        return ProbeResult(
            provider=provider,
            alias=alias,
            model_id=model_id,
            ok=False,
            elapsed_ms=int((time.monotonic() - start) * 1000),
            detail=f"{type(exc).__name__}: {exc}",
        )

    elapsed_ms = int((time.monotonic() - start) * 1000)
    if response.status_code >= 400:
        return ProbeResult(
            provider=provider,
            alias=alias,
            model_id=model_id,
            ok=False,
            elapsed_ms=elapsed_ms,
            detail=f"HTTP {response.status_code}: {response.text}",
        )

    try:
        text = text_extractor(response.json())
    except Exception as exc:  # noqa: BLE001 - we want to surface any decode issue
        return ProbeResult(
            provider=provider,
            alias=alias,
            model_id=model_id,
            ok=False,
            elapsed_ms=elapsed_ms,
            detail=f"response shape error: {exc}",
        )

    snippet = text.strip().replace("\n", " ")[:60]
    return ProbeResult(
        provider=provider,
        alias=alias,
        model_id=model_id,
        ok=True,
        elapsed_ms=elapsed_ms,
        detail=snippet or "(empty body)",
    )


def _extract_google_text(data: dict[str, Any]) -> str:
    return data["candidates"][0]["content"]["parts"][0]["text"]


def _extract_openai_text(data: dict[str, Any]) -> str:
    content = data["choices"][0]["message"]["content"]
    if isinstance(content, list):
        return "".join(part.get("text", "") for part in content if isinstance(part, dict))
    return str(content)


def _build_probe_plan(settings: Settings) -> list[tuple[str, str, str]]:
    """Returns ``(provider, alias, resolved_model_id)`` triples."""
    return [
        ("google", "gemma-4-26b", settings.google_model_gemma_4_26b),
        ("google", "gemma-4-31b", settings.google_model_gemma_4_31b),
        ("groq", "llama-3.1-8b", settings.groq_model_llama_3_1_8b),
        ("nvidia", "gemma-3-4b", settings.nvidia_model_gemma_3_4b),
        ("nvidia", "gemma-3-12b", settings.nvidia_model_gemma_3_12b),
        ("nvidia", "gemma-3-27b", settings.nvidia_model_gemma_3_27b),
        ("nvidia", "gemma-3n-e4b", settings.nvidia_model_gemma_3n_e4b),
        ("nvidia", "gemma-3n-e2b", settings.nvidia_model_gemma_3n_e2b),
    ]


async def _run_probe(
    settings: Settings,
    provider: str,
    alias: str,
    model_id: str,
    client: httpx.AsyncClient,
) -> ProbeResult:
    if provider == "google":
        return await _probe_google(settings, alias, model_id, client)
    if provider == "groq":
        return await _probe_groq(settings, alias, model_id, client)
    if provider == "nvidia":
        return await _probe_nvidia(settings, alias, model_id, client)
    return ProbeResult(provider, alias, model_id, False, 0, f"unknown provider: {provider}")


def _print_results(results: list[ProbeResult]) -> None:
    provider_w = max(len(r.provider) for r in results)
    alias_w = max(len(r.alias) for r in results)
    model_w = max(len(r.model_id) for r in results)

    header = f"{'PROVIDER':<{provider_w}}  {'ALIAS':<{alias_w}}  {'MODEL':<{model_w}}  STATUS  LATENCY"
    print(header)
    print("-" * len(header))

    for r in results:
        status = "OK  " if r.ok else "FAIL"
        latency = f"{r.elapsed_ms:>6d}ms"
        print(
            f"{r.provider:<{provider_w}}  {r.alias:<{alias_w}}  {r.model_id:<{model_w}}  {status}  {latency}"
        )

    failures = [r for r in results if not r.ok]
    if failures:
        print()
        print("=" * 80)
        print("FAILURE DETAILS")
        print("=" * 80)
        for r in failures:
            print(f"\n[{r.provider} / {r.alias} / {r.model_id}]")
            print(r.detail)

    total = len(results)
    passed = sum(1 for r in results if r.ok)
    failed = total - passed
    print()
    print(f"Summary: {passed}/{total} passed, {failed} failed")


async def main() -> int:
    settings = get_settings()
    plan = _build_probe_plan(settings)

    timeout = httpx.Timeout(PROBE_TIMEOUT_SECONDS, connect=10.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        results = await asyncio.gather(
            *(
                _run_probe(settings, provider, alias, model_id, client)
                for provider, alias, model_id in plan
            )
        )

    _print_results(list(results))
    return 0 if all(r.ok for r in results) else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
