from __future__ import annotations

import json
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig

from features.agent.conversation import (
    format_conversation_transcript,
    prior_transcript_before_latest_user,
)
from features.agent.llm import create_agent_llm
from features.agent.prompts import RESPOND_SYSTEM
from features.agent.respond_parse import parse_respond_json
from features.agent.schemas import AgentRespondResult
from features.agent.state import AgentState
from features.agent.time_range import enrich_cashflow_blocks
from features.agent.timezone_context import prepend_temporal_context


def _build_respond_prompt(
    state: AgentState, config: RunnableConfig
) -> list[SystemMessage | HumanMessage]:
    user_question = ""
    for msg in reversed(state["messages"]):
        if msg.type == "human" and isinstance(msg.content, str):
            user_question = msg.content
            break

    payload = {
        "user_question": user_question,
        "prior_conversation": prior_transcript_before_latest_user(state["messages"]),
        "conversation": format_conversation_transcript(state["messages"]),
        "goal": state.get("goal"),
        "time_range": state.get("time_range"),
        "reflection": state.get("reflection"),
        "last_result": state.get("last_result"),
        "sql_attempts": state.get("sql_attempts", []),
        "fatal_error": state.get("error"),
    }
    return [
        SystemMessage(content=prepend_temporal_context(RESPOND_SYSTEM, config)),
        HumanMessage(content=json.dumps(payload, default=str)),
    ]


def _fallback_answer(state: AgentState, *, reason: str) -> AgentRespondResult:
    last_result = state.get("last_result") or {}
    if last_result.get("error"):
        return AgentRespondResult(
            answer="I couldn't fetch your data right now. Please try again.",
            blocks=[],
        )
    if int(last_result.get("row_count") or 0) == 0:
        return AgentRespondResult(
            answer="I didn't find any transactions for that period.",
            blocks=[],
        )
    return AgentRespondResult(
        answer="Here's what I found, but I couldn't format a chart response.",
        blocks=[],
    )


async def respond(state: AgentState, config: RunnableConfig) -> dict[str, Any]:
    llm = create_agent_llm()
    response = await llm.ainvoke(_build_respond_prompt(state, config), config=config)
    raw = response.content
    text = raw if isinstance(raw, str) else str(raw)

    try:
        parsed = parse_respond_json(text)
    except (json.JSONDecodeError, ValueError):
        parsed = _fallback_answer(state, reason="parse_error")

    enrich_cashflow_blocks(parsed.blocks, state.get("time_range"))

    answer = parsed.answer
    ui_blocks = [block.model_dump() for block in parsed.blocks]

    return {
        "messages": [AIMessage(content=answer)],
        "ui_blocks": ui_blocks,
        "error": None,
    }
