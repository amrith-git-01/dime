from __future__ import annotations

from features.agent.graph import build_agent_graph, route_after_reflect
from features.agent.state import initial_agent_state


def test_route_after_reflect_retries_on_hint() -> None:
    state = initial_agent_state()
    state["next_sql_hint"] = "Fix SQL error: column does not exist"
    state["query_rounds"] = 2

    assert route_after_reflect(state) == "generate_sql"


def test_route_after_reflect_stops_at_cap() -> None:
    state = initial_agent_state()
    state["next_sql_hint"] = "Fix SQL error: column does not exist"
    state["query_rounds"] = 5

    assert route_after_reflect(state) == "respond"


def test_route_after_reflect_no_hint_goes_to_respond() -> None:
    state = initial_agent_state()
    state["next_sql_hint"] = None
    state["query_rounds"] = 1

    assert route_after_reflect(state) == "respond"


def test_graph_compiles_with_expected_nodes() -> None:
    graph = build_agent_graph()
    node_names = set(graph.get_graph().nodes.keys())
    assert {"generate_sql", "execute_sql", "reflect", "respond"}.issubset(node_names)
    # Old nodes must be gone
    assert "understand_goal" not in node_names
    assert "clarify" not in node_names
