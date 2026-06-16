from __future__ import annotations

from typing import Annotated, Any, TypedDict

from langgraph.graph.message import add_messages
from langchain_core.messages import BaseMessage


class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    time_range: dict[str, Any] | None
    sql_attempts: list[dict[str, Any]]
    last_result: dict[str, Any] | None
    next_sql_hint: str | None
    query_rounds: int
    ui_blocks: list[dict[str, Any]]
    deep_link: dict[str, Any] | None
    error: str | None
    # Pre-fetched InsightsService data for month-pair comparisons.
    # Populated by fetch_compare_data node; used by respond node for LLM prose.
    compare_insights: dict[str, Any] | None


def initial_agent_state() -> AgentState:
    return {
        "messages": [],
        "time_range": None,
        "sql_attempts": [],
        "last_result": None,
        "next_sql_hint": None,
        "query_rounds": 0,
        "ui_blocks": [],
        "deep_link": None,
        "error": None,
        "compare_insights": None,
    }
