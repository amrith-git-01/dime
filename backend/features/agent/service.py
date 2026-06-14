"""Agent chat orchestration — stateless JSON responses (no persistence)."""

from __future__ import annotations

import logging
from typing import Any

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage

from core.config import get_settings
from features.agent.conversation import history_to_messages
from features.agent.graph import agent_graph
from features.agent.schemas import ChatHistoryMessage, ChatRequest, ChatResponse
from features.agent.state import initial_agent_state

logger = logging.getLogger(__name__)


def _latest_assistant_text(messages: list[BaseMessage]) -> str:
    for msg in reversed(messages):
        if isinstance(msg, AIMessage) and isinstance(msg.content, str):
            return msg.content.strip()
    return ""


def _trim_history(
    history: list[ChatHistoryMessage], *, max_messages: int
) -> list[ChatHistoryMessage]:
    if len(history) <= max_messages:
        return history
    return history[-max_messages:]


class AgentService:
    async def chat(
        self,
        *,
        user_id: str,
        user_jwt: str,
        body: ChatRequest,
    ) -> ChatResponse:
        settings = get_settings()
        trimmed_history = _trim_history(
            body.history,
            max_messages=settings.agent_context_max_messages,
        )

        state = initial_agent_state()
        state["messages"] = [
            *history_to_messages(trimmed_history),
            HumanMessage(content=body.content),
        ]

        config: dict[str, Any] = {
            "configurable": {
                "user_id": user_id,
                "user_jwt": user_jwt,
                "timezone": body.timezone,
            }
        }

        try:
            final_state = await agent_graph.ainvoke(state, config=config)
        except Exception:
            logger.exception("Agent graph failed user_id=%s", user_id)
            raise

        answer = _latest_assistant_text(final_state.get("messages") or [])
        if not answer:
            msg = "Agent produced no answer"
            raise RuntimeError(msg)

        blocks = final_state.get("ui_blocks") or []
        deep_link = final_state.get("deep_link")
        deep_link_out = deep_link if isinstance(deep_link, dict) else None

        return ChatResponse(
            answer=answer,
            blocks=blocks,
            deep_link=deep_link_out,
        )
