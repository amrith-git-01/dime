from __future__ import annotations

from langchain_core.messages import HumanMessage

from features.agent.nodes.reflect import _budget_spend_guard
from features.agent.state import initial_agent_state


def test_budget_guard_retries_when_sql_omits_transactions() -> None:
    state = initial_agent_state()
    state["goal"] = "Check if user is over monthly budget"
    state["messages"] = [HumanMessage(content="Am I over my monthly budget?")]
    state["sql_attempts"] = [{"sql": "SELECT monthly_budget FROM budgets"}]
    state["last_result"] = {
        "rows": [{"monthly_budget": 25000}],
        "row_count": 1,
    }

    guard = _budget_spend_guard(state)

    assert guard is not None
    assert guard.status == "retry"
    assert "transactions" in (guard.next_sql_hint or "").lower()


def test_budget_guard_passes_when_spent_present() -> None:
    state = initial_agent_state()
    state["goal"] = "Compare monthly budget to June spend"
    state["messages"] = [HumanMessage(content="Am I over my monthly budget?")]
    state["sql_attempts"] = [
        {
            "sql": (
                "SELECT b.monthly_budget, COALESCE(SUM(t.amount),0) AS spent "
                "FROM budgets b LEFT JOIN transactions t ON ..."
            ),
        },
    ]
    state["last_result"] = {
        "rows": [{"monthly_budget": 25000, "spent": 18388}],
        "row_count": 1,
    }

    assert _budget_spend_guard(state) is None
