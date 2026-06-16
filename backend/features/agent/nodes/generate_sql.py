from __future__ import annotations

import json
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig

from features.agent.conversation import latest_user_text
from features.agent.llm import create_agent_llm
from features.agent.llm_invoke import agent_llm_ainvoke
from features.agent.prompts import generate_sql_system
from features.agent.state import AgentState
from features.agent.time_range import MAX_DAILY_COMPARISON_DAYS
from features.agent.timezone_context import prepend_temporal_context
from features.agent.tools import run_sql
from features.agent.trace import (
    elapsed_ms_since,
    log_node_complete,
    log_node_error,
    log_node_start,
    node_timer,
)

_NODE = "generate_sql"


def _build_prompt(
    state: AgentState, config: RunnableConfig
) -> list[SystemMessage | HumanMessage]:
    user_text = latest_user_text(state["messages"])
    parts = [user_text]

    time_range = state.get("time_range")
    if time_range:
        parts.append(
            f"\ntime_range (use these bounds exactly): {json.dumps(time_range, default=str)}"
        )
        if time_range.get("daily_comparison"):
            parts.append(
                f"Per-day breakdown requested — max {MAX_DAILY_COMPARISON_DAYS} days."
            )

    if hint := state.get("next_sql_hint"):
        parts.append(f"\nFix hint from previous attempt: {hint}")

    system = prepend_temporal_context(generate_sql_system(), config)
    return [SystemMessage(content=system), HumanMessage(content="\n".join(parts))]


async def generate_sql(state: AgentState, config: RunnableConfig) -> dict[str, Any]:
    log_node_start(node=_NODE, config=config, state=state)
    start = node_timer()
    try:
        llm = create_agent_llm().bind_tools([run_sql], tool_choice="required")
        response = await agent_llm_ainvoke(
            llm, _build_prompt(state, config), node=_NODE, config=config
        )

        tool_calls = getattr(response, "tool_calls", None) or []
        if not tool_calls:
            output = {
                "messages": [response],
                "next_sql_hint": None,
                "error": "Model did not produce a run_sql tool call",
            }
            log_node_complete(
                node=_NODE, config=config, duration_ms=elapsed_ms_since(start), output=output
            )
            return output

        output = {"messages": [response], "next_sql_hint": None, "error": None}
        log_node_complete(
            node=_NODE, config=config, duration_ms=elapsed_ms_since(start), output=output
        )
        return output
    except Exception as exc:
        log_node_error(
            node=_NODE, config=config, duration_ms=elapsed_ms_since(start), error=str(exc)
        )
        raise
