from __future__ import annotations

import json
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig

from features.agent.llm import create_agent_llm
from features.agent.prompts import generate_sql_system
from features.agent.state import AgentState
from features.agent.timezone_context import prepend_temporal_context
from features.agent.time_range import MAX_DAILY_COMPARISON_DAYS
from features.agent.tools import run_sql


def _build_prompt(
    state: AgentState, config: RunnableConfig
) -> list[SystemMessage | HumanMessage]:
    parts = [f"Goal: {state['goal']}"]

    time_range = state.get("time_range")
    if time_range:
        parts.append(
            "Resolved time range (use these exact bounds in WHERE — do not recalculate): "
            f"{json.dumps(time_range, default=str)}"
        )
        parts.append(
            "For daily breakdowns, generate one row per calendar day from start_date "
            "through end_date inclusive (use generate_series + left join; COALESCE "
            "missing days to 0)."
        )
        if time_range.get("daily_comparison"):
            parts.append(
                f"Daily comparison guardrail: window is at most {MAX_DAILY_COMPARISON_DAYS} "
                "days — use the provided bounds exactly."
            )

    reflection = state.get("reflection")
    if reflection and reflection.get("next_sql_hint"):
        parts.append(f"Hint from last attempt: {reflection['next_sql_hint']}")

    if state.get("sql_attempts"):
        parts.append(f"Previous attempts this turn: {len(state['sql_attempts'])}")

    system = prepend_temporal_context(generate_sql_system(), config)

    return [
        SystemMessage(content=system),
        HumanMessage(content="\n".join(parts)),
    ]

async def generate_sql(state: AgentState, config: RunnableConfig) -> dict[str, Any]:
    if not state.get("goal"):
        return {"error": "Missing goal - understand_goal must run first"}

    llm = create_agent_llm().bind_tools([run_sql], tool_choice="required")
    response = await llm.ainvoke(_build_prompt(state, config), config=config)

    tool_calls = getattr(response, "tool_calls", None) or []
    if not tool_calls:
        return {
            "messages": [response],
            "error": "Model did not produce a run_sql tool call",
        }

    return {"messages": [response], "error": None}