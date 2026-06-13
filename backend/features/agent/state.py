from __future__ import annotations

from typing import Annotated, Any, TypedDict

from langgraph.graph.message import add_messages
from langchain_core.messages import BaseMessage

class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    goal: str | None
    sql_attempts: list[dict[str, Any]]
    last_result: dict[str, Any] | None
    reflection: dict[str, Any] | None
    query_rounds: int
    ui_blocks: list[dict[str, Any]]
    deep_link: dict[str, Any] | None
    error: str | None


def initial_agent_state() -> AgentState:
    return {
        "messages": [],
        "goal": None,
        "sql_attempts": [],
        "last_result": None,
        "reflection": None,
        "query_rounds": 0,
        "ui_blocks": [],
        "deep_link": None,
        "error": None,
    }