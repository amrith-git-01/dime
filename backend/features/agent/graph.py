from __future__ import annotations

from typing import Literal

from langgraph.graph import END, START, StateGraph

from core.config import get_settings
from features.agent.nodes.classify_intent import classify_intent
from features.agent.nodes.execute_sql import execute_sql
from features.agent.nodes.fetch_compare_data import fetch_compare_data
from features.agent.nodes.generate_sql import generate_sql
from features.agent.nodes.reflect import reflect
from features.agent.nodes.respond import respond
from features.agent.state import AgentState

RouteAfterClassify = Literal["fetch_compare_data", "generate_sql"]
RouteAfterReflect = Literal["generate_sql", "respond"]


def route_after_classify(state: AgentState) -> RouteAfterClassify:
    """Route InsightsService-backed comparisons directly; all else goes to SQL."""
    time_range = state.get("time_range") or {}
    if time_range.get("kind") == "compare" and time_range.get("subkind") in (
        "month_pair",
        "year_pair",
    ):
        return "fetch_compare_data"
    return "generate_sql"


def route_after_reflect(state: AgentState) -> RouteAfterReflect:
    max_rounds = get_settings().agent_max_tool_rounds
    if state.get("query_rounds", 0) >= max_rounds:
        return "respond"
    if state.get("next_sql_hint"):
        return "generate_sql"
    return "respond"


def build_agent_graph():
    graph = StateGraph(AgentState)

    graph.add_node("classify_intent", classify_intent)
    graph.add_node("fetch_compare_data", fetch_compare_data)
    graph.add_node("generate_sql", generate_sql)
    graph.add_node("execute_sql", execute_sql)
    graph.add_node("reflect", reflect)
    graph.add_node("respond", respond)

    graph.add_edge(START, "classify_intent")
    graph.add_conditional_edges("classify_intent", route_after_classify)
    graph.add_edge("fetch_compare_data", "respond")
    graph.add_edge("generate_sql", "execute_sql")
    graph.add_edge("execute_sql", "reflect")
    graph.add_conditional_edges("reflect", route_after_reflect)
    graph.add_edge("respond", END)

    return graph.compile()


agent_graph = build_agent_graph()
