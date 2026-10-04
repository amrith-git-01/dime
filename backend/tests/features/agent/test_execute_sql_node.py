from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from langchain_core.messages import AIMessage

from features.agent.nodes.execute_sql import _extract_run_sql_call, execute_sql
from features.agent.sql_executor import SQLExecutionResult
from features.agent.state import initial_agent_state


def test_extract_run_sql_call_from_ai_message() -> None:
    state = initial_agent_state()
    state["messages"] = [
        AIMessage(
            content="",
            tool_calls=[
                {
                    "id": "call_1",
                    "name": "run_sql",
                    "args": {"sql": "SELECT 1"},
                }
            ],
        )
    ]

    extracted = _extract_run_sql_call(state)
    assert extracted == ("SELECT 1", "call_1")


def test_extract_run_sql_call_returns_none_without_tool() -> None:
    state = initial_agent_state()
    state["messages"] = [AIMessage(content="no tools")]

    assert _extract_run_sql_call(state) is None


@pytest.mark.asyncio
async def test_execute_sql_updates_state(monkeypatch: pytest.MonkeyPatch) -> None:
    state = initial_agent_state()
    state["messages"] = [
        AIMessage(
            content="",
            tool_calls=[
                {
                    "id": "call_1",
                    "name": "run_sql",
                    "args": {"sql": "SELECT amount FROM transactions"},
                }
            ],
        )
    ]
    state["query_rounds"] = 0

    mock_execute = AsyncMock(
        return_value=SQLExecutionResult(
            rows=[{"amount": 100}],
            row_count=1,
            columns=["amount"],
            truncated=False,
            error=None,
            elapsed_ms=12,
        )
    )
    monkeypatch.setattr("features.agent.nodes.execute_sql.execute_readonly_sql", mock_execute)

    update = await execute_sql(state, config={"configurable": {"user_id": "u1"}})

    assert update["query_rounds"] == 1
    assert update["last_result"]["row_count"] == 1
    assert len(update["sql_attempts"]) == 1
    assert update["sql_attempts"][0]["sql"] == "SELECT amount FROM transactions"
    assert update["messages"][0].tool_call_id == "call_1"
