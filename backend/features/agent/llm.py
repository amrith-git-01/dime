from __future__ import annotations

from langchain_deepseek import ChatDeepSeek
from pydantic import SecretStr

from core.config import Settings, get_settings


def create_agent_llm(settings: Settings | None = None) -> ChatDeepSeek:
    """Return a ChatDeepSeek instance configured for the agent.

    Uses langchain-deepseek so that .with_structured_output() routes through
    DeepSeek's native tool-calling path for schema-enforced outputs.
    """
    cfg = settings or get_settings()
    if not cfg.ai_api_key:
        msg = "DEEPSEEK_API_KEY / AI_API_KEY is missing"
        raise ValueError(msg)

    kwargs: dict = {}
    if not cfg.agent_thinking_enabled:
        kwargs["extra_body"] = {"thinking": {"type": "disabled"}}

    return ChatDeepSeek(
        model=cfg.agent_model,
        api_key=SecretStr(cfg.ai_api_key),
        base_url=cfg.agent_base_url.rstrip("/"),
        temperature=0.0,
        timeout=cfg.agent_timeout_seconds,
        **kwargs,
    )
