from __future__ import annotations

from langchain_openai import ChatOpenAI
from pydantic import SecretStr

from core.config import Settings, get_settings

def create_agent_llm(settings: Settings | None = None) -> ChatOpenAI:
    cfg = settings or get_settings()
    if not cfg.ai_api_key:
        msg = "DEEPSEEK_API_KEY / AI_API_KEY is missing"
        raise ValueError(msg)

    extra_body: dict | None = None
    if not cfg.agent_thinking_enabled:
        extra_body = {"thinking": {"type": "disabled"}}

    return ChatOpenAI(
        model=cfg.agent_model,
        api_key=SecretStr(cfg.ai_api_key),
        base_url=cfg.agent_base_url.rstrip("/"),
        temperature=0.0,
        timeout=cfg.agent_timeout_seconds,
        extra_body=extra_body,
    )