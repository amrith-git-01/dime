from __future__ import annotations

from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig

from features.agent.llm import create_agent_llm
from features.agent.prompts import generate_sql_system
from features.agent.state import AgentState
from features.agent.tools import run_sql

def _build_prompt(state: AgentState) -> list[SystemMessage | HumanMessage]:
    parts = [f"Goal: {state['goal']}"]

    reflection = state.get("reflection")
    if reflection and reflection.get("next_sql_hint"):
        parts.append(f"Hint from last attempt: {reflection['next_sql_hint']}")

    if state.get("sql_attempts"):
        parts.append(f"Previous attempts this turn: {len(state['sql_attempts'])}")

    return [
        SystemMessage(content=generate_sql_system()),
        HumanMessage(content="\n".join(parts)),
    ]

async def generate_sql(state: AgentState, config: RunnableConfig) -> dict[str, Any]:
    if not state.get("goal"):
        return {"error": "Missing goal - understand_goal must run first"}

    llm = create_agent_llm().bind_tools([run_sql], tool_choice="required")
    response = await llm.ainvoke(_build_prompt(state), config=config)

    tool_calls = getattr(response, "tool_calls", None) or []
    if not tool_calls:
        return {
            "messages": [response],
            "error": "Model did not produce a run_sql tool call",
        }

    return {"messages": [response], "error": None}