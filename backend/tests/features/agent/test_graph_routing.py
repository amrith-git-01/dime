from __future__ import annotations

from features.agent.graph import build_agent_graph, route_after_reflect, route_after_understand
from features.agent.state import initial_agent_state


def test_route_after_reflect_retries_under_cap() -> None:
    state = initial_agent_state()
    state["reflection"] = {"status": "retry", "reason": "try again"}
    state["query_rounds"] = 2

    assert route_after_reflect(state) == "generate_sql"


def test_route_after_reflect_stops_at_cap() -> None:
    state = initial_agent_state()
    state["reflection"] = {"status": "retry", "reason": "try again"}
    state["query_rounds"] = 5

    assert route_after_reflect(state) == "respond"


def test_route_after_reflect_sufficient_goes_to_respond() -> None:
    state = initial_agent_state()
    state["reflection"] = {"status": "sufficient", "reason": "ok"}
    state["query_rounds"] = 1

    assert route_after_reflect(state) == "respond"


def test_route_after_understand_clarifies_when_needed() -> None:
    state = initial_agent_state()
    state["clarification"] = "Please narrow the range."

    assert route_after_understand(state) == "clarify"


def test_route_after_understand_runs_sql_by_default() -> None:
    state = initial_agent_state()

    assert route_after_understand(state) == "generate_sql"


def test_graph_compiles_with_expected_nodes() -> None:
    graph = build_agent_graph()
    node_names = set(graph.get_graph().nodes.keys())
    assert {
        "understand_goal",
        "clarify",
        "generate_sql",
        "execute_sql",
        "reflect",
        "respond",
    }.issubset(node_names)
