"""Agent chat orchestration — stateless JSON responses (no persistence)."""

from __future__ import annotations

import logging
import time
from typing import Any

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage

from core.config import get_settings
from features.agent.conversation import history_to_messages
from features.agent.graph import agent_graph
from features.agent.schemas import ChatHistoryMessage, ChatRequest, ChatResponse
from features.agent.state import initial_agent_state
from features.agent.time_range import resolve_daily_comparison_range, resolve_time_range
from features.agent.trace import log_turn_complete, log_turn_start, new_trace_id

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
        trace_id = new_trace_id()
        turn_start = time.perf_counter()
        tz = body.timezone

        # Resolve single-period time ranges deterministically (today, last N days,
        # this month, etc.).  Comparison detection is handled by the classify_intent
        # graph node, which may override time_range when it detects a comparison.
        time_range = resolve_time_range(body.content, timezone=tz)
        time_range, clarification = resolve_daily_comparison_range(
            user_text=body.content,
            goal=body.content,
            time_range=time_range,
            timezone=tz,
        )

        trimmed_history = _trim_history(
            body.history,
            max_messages=settings.agent_context_max_messages,
        )

        log_turn_start(
            trace_id=trace_id,
            user_id=user_id,
            user_message=body.content,
            history_count=len(trimmed_history),
            timezone=tz,
        )

        if clarification:
            duration_ms = int((time.perf_counter() - turn_start) * 1000)
            log_turn_complete(
                trace_id=trace_id,
                user_id=user_id,
                duration_ms=duration_ms,
                answer=clarification,
                block_count=0,
                deep_link=None,
            )
            return ChatResponse(answer=clarification, blocks=[], deep_link=None)

        state = initial_agent_state()
        state["messages"] = [
            *history_to_messages(trimmed_history),
            HumanMessage(content=body.content),
        ]
        state["time_range"] = time_range

        config: dict[str, Any] = {
            "configurable": {
                "user_id": user_id,
                "user_jwt": user_jwt,
                "timezone": tz,
                "trace_id": trace_id,
            }
        }

        try:
            final_state = await agent_graph.ainvoke(state, config=config)
        except Exception:
            logger.exception(
                "Agent graph failed trace_id=%s user_id=%s",
                trace_id,
                user_id,
            )
            raise

        answer = _latest_assistant_text(final_state.get("messages") or [])
        if not answer:
            msg = "Agent produced no answer"
            raise RuntimeError(msg)

        blocks = final_state.get("ui_blocks") or []
        deep_link = final_state.get("deep_link")
        deep_link_out = deep_link if isinstance(deep_link, dict) else None

        duration_ms = int((time.perf_counter() - turn_start) * 1000)
        log_turn_complete(
            trace_id=trace_id,
            user_id=user_id,
            duration_ms=duration_ms,
            answer=answer,
            block_count=len(blocks),
            deep_link=deep_link_out,
        )

        return ChatResponse(
            answer=answer,
            blocks=blocks,
            deep_link=deep_link_out,
        )
