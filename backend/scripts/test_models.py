"""Connection test for AI models used by the DeepSeek + Groq preprocess pipeline.

Usage (from the ``backend`` directory):

    python -m scripts.test_models

Probes:
- DeepSeek V4 Flash (parse brain)
- Groq Whisper primary + fallback (voice preprocess)
- Groq Llama 4 Scout (receipt OCR preprocess)
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from typing import Any

import httpx

from core.config import Settings, get_settings

PING_PROMPT = "Reply with the single word: OK"
PROBE_TIMEOUT_SECONDS = 30.0


@dataclass(slots=True)
class ProbeResult:
    role: str
    provider: str
    model_id: str
    ok: bool
    elapsed_ms: int
    detail: str


async def _execute_probe(
    *,
    role: str,
    provider: str,
    model_id: str,
    start: float,
    client: httpx.AsyncClient,
    method: str,
    url: str,
    headers: dict[str, str],
    json_body: dict[str, Any] | None = None,
    data: dict[str, str] | None = None,
    files: dict[str, tuple[str, bytes, str]] | None = None,
    text_extractor,
) -> ProbeResult:
    try:
        response = await client.request(
            method,
            url,
            headers=headers,
            json=json_body,
            data=data,
            files=files,
        )
    except httpx.HTTPError as exc:
        return ProbeResult(
            role=role,
            provider=provider,
            model_id=model_id,
            ok=False,
            elapsed_ms=int((time.monotonic() - start) * 1000),
            detail=f"{type(exc).__name__}: {exc}",
        )

    elapsed_ms = int((time.monotonic() - start) * 1000)
    if response.status_code >= 400:
        return ProbeResult(
            role=role,
            provider=provider,
            model_id=model_id,
            ok=False,
            elapsed_ms=elapsed_ms,
            detail=f"HTTP {response.status_code}: {response.text[:400]}",
        )

    try:
        text = text_extractor(response.json()) if response.content else ""
    except Exception as exc:  # noqa: BLE001
        return ProbeResult(
            role=role,
            provider=provider,
            model_id=model_id,
            ok=False,
            elapsed_ms=elapsed_ms,
            detail=f"response shape error: {exc}",
        )

    snippet = text.strip().replace("\n", " ")[:60]
    return ProbeResult(
        role=role,
        provider=provider,
        model_id=model_id,
        ok=True,
        elapsed_ms=elapsed_ms,
        detail=snippet or "(empty body)",
    )


def _extract_openai_text(data: dict[str, Any]) -> str:
    content = data["choices"][0]["message"]["content"]
    if isinstance(content, list):
        return "".join(part.get("text", "") for part in content if isinstance(part, dict))
    return str(content)


async def _probe_deepseek(
    settings: Settings,
    model_id: str,
    client: httpx.AsyncClient,
) -> ProbeResult:
    start = time.monotonic()
    if not settings.ai_api_key:
        return ProbeResult(
            "parse",
            "deepseek",
            model_id,
            False,
            0,
            "DEEPSEEK_API_KEY / AI_API_KEY missing",
        )

    body = {
        "model": model_id,
        "messages": [{"role": "user", "content": PING_PROMPT}],
        "temperature": 0.0,
        "max_tokens": 8,
        "thinking": {"type": "disabled"},
    }
    headers = {
        "Authorization": f"Bearer {settings.ai_api_key}",
        "Content-Type": "application/json",
    }
    return await _execute_probe(
        role="parse",
        provider="deepseek",
        model_id=model_id,
        start=start,
        client=client,
        method="POST",
        url=settings.ai_base_url,
        headers=headers,
        json_body=body,
        text_extractor=_extract_openai_text,
    )


async def _probe_groq_chat(
    settings: Settings,
    model_id: str,
    client: httpx.AsyncClient,
) -> ProbeResult:
    start = time.monotonic()
    if not settings.groq_api_key:
        return ProbeResult("ocr", "groq", model_id, False, 0, "GROQ_API_KEY missing")

    url = f"{settings.groq_base_url.rstrip('/')}/chat/completions"
    body = {
        "model": model_id,
        "messages": [{"role": "user", "content": PING_PROMPT}],
        "temperature": 0.0,
        "max_tokens": 8,
    }
    headers = {"Authorization": f"Bearer {settings.groq_api_key}"}
    return await _execute_probe(
        role="ocr",
        provider="groq",
        model_id=model_id,
        start=start,
        client=client,
        method="POST",
        url=url,
        headers=headers,
        json_body=body,
        text_extractor=_extract_openai_text,
    )


async def _probe_groq_whisper(
    settings: Settings,
    model_id: str,
    client: httpx.AsyncClient,
) -> ProbeResult:
    start = time.monotonic()
    if not settings.groq_api_key:
        return ProbeResult("stt", "groq", model_id, False, 0, "GROQ_API_KEY missing")

    # Minimal valid-ish WAV header + silence (probe connectivity, not quality).
    silent_wav = (
        b"RIFF$\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00"
        b"\x80>\x00\x00\x00}\x00\x00\x02\x00\x10\x00data\x00\x00\x00\x00"
    )
    url = f"{settings.groq_base_url.rstrip('/')}/audio/transcriptions"
    headers = {"Authorization": f"Bearer {settings.groq_api_key}"}

    def _extract_transcript(data: dict[str, Any]) -> str:
        return str(data.get("text", ""))

    return await _execute_probe(
        role="stt",
        provider="groq",
        model_id=model_id,
        start=start,
        client=client,
        method="POST",
        url=url,
        headers=headers,
        data={"model": model_id},
        files={"file": ("probe.wav", silent_wav, "audio/wav")},
        text_extractor=_extract_transcript,
    )


def _build_probe_plan(settings: Settings) -> list[tuple[str, str, str, str]]:
    """Returns ``(role, provider, alias, model_id)``."""
    plan: list[tuple[str, str, str, str]] = []

    for entry in settings.ai_parse_fallback.split(","):
        item = entry.strip()
        if not item or ":" not in item:
            continue
        provider, model = item.split(":", maxsplit=1)
        if provider.strip().lower() == "deepseek":
            plan.append(("parse", "deepseek", model.strip(), model.strip()))

    if not plan:
        plan.append(("parse", "deepseek", settings.ai_model, settings.ai_model))

    plan.append(("stt", "groq", "whisper-primary", settings.groq_whisper_primary))
    plan.append(("stt", "groq", "whisper-fallback", settings.groq_whisper_fallback))
    plan.append(("ocr", "groq", "vision-ocr", settings.groq_vision_ocr_model))
    return plan


async def _run_probe(
    settings: Settings,
    role: str,
    provider: str,
    alias: str,
    model_id: str,
    client: httpx.AsyncClient,
) -> ProbeResult:
    if provider == "deepseek":
        return await _probe_deepseek(settings, model_id, client)
    if provider == "groq" and role == "stt":
        return await _probe_groq_whisper(settings, model_id, client)
    if provider == "groq" and role == "ocr":
        return await _probe_groq_chat(settings, model_id, client)
    return ProbeResult(role, provider, model_id, False, 0, f"unknown probe: {role}/{provider}")


def _print_results(results: list[ProbeResult]) -> None:
    role_w = max(len(r.role) for r in results)
    provider_w = max(len(r.provider) for r in results)
    model_w = max(len(r.model_id) for r in results)

    header = (
        f"{'ROLE':<{role_w}}  {'PROVIDER':<{provider_w}}  "
        f"{'MODEL':<{model_w}}  STATUS  LATENCY"
    )
    print(header)
    print("-" * len(header))

    for r in results:
        status = "OK  " if r.ok else "FAIL"
        latency = f"{r.elapsed_ms:>6d}ms"
        print(
            f"{r.role:<{role_w}}  {r.provider:<{provider_w}}  "
            f"{r.model_id:<{model_w}}  {status}  {latency}"
        )

    failures = [r for r in results if not r.ok]
    if failures:
        print()
        print("=" * 80)
        print("FAILURE DETAILS")
        print("=" * 80)
        for r in failures:
            print(f"\n[{r.role} / {r.provider} / {r.model_id}]")
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
                _run_probe(settings, role, provider, alias, model_id, client)
                for role, provider, alias, model_id in plan
            )
        )

    _print_results(list(results))
    return 0 if all(r.ok for r in results) else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
