from __future__ import annotations

from typing import Literal

from langgraph.graph import END, START, StateGraph

from core.config import get_settings
from features.agent.nodes.clarify import clarify
from features.agent.nodes.execute_sql import execute_sql
from features.agent.nodes.generate_sql import generate_sql
from features.agent.nodes.reflect import reflect
from features.agent.nodes.respond import respond
from features.agent.nodes.understand import understand_goal
from features.agent.state import AgentState

RouteAfterReflect = Literal["generate_sql", "respond"]
RouteAfterUnderstand = Literal["generate_sql", "clarify"]


def route_after_understand(state: AgentState) -> RouteAfterUnderstand:
    if state.get("clarification"):
        return "clarify"
    return "generate_sql"


def route_after_reflect(state: AgentState) -> RouteAfterReflect:
    reflection = state.get("reflection") or {}
    status = reflection.get("status")
    max_rounds = get_settings().agent_max_tool_rounds

    if status == "retry" and state.get("query_rounds", 0) < max_rounds:
        return "generate_sql"
    return "respond"


def build_agent_graph():
    graph = StateGraph(AgentState)

    graph.add_node("understand_goal", understand_goal)
    graph.add_node("clarify", clarify)
    graph.add_node("generate_sql", generate_sql)
    graph.add_node("execute_sql", execute_sql)
    graph.add_node("reflect", reflect)
    graph.add_node("respond", respond)

    graph.add_edge(START, "understand_goal")
    graph.add_conditional_edges("understand_goal", route_after_understand)
    graph.add_edge("clarify", END)
    graph.add_edge("generate_sql", "execute_sql")
    graph.add_edge("execute_sql", "reflect")
    graph.add_conditional_edges("reflect", route_after_reflect)
    graph.add_edge("respond", END)

    return graph.compile()

agent_graph = build_agent_graph()