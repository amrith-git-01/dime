from __future__ import annotations

from typing import Any

from langchain_core.runnables import RunnableConfig

from features.agent.conversation import latest_user_text
from features.agent.state import AgentState
from features.agent.trace import (
    elapsed_ms_since,
    log_node_complete,
    log_node_start,
    node_timer,
)

_NODE = "reflect"

_BUDGET_HINT = (
    "Join budgets with SUM(debit transactions) for the resolved month using "
    "transaction_at >= time_range.start_iso AND transaction_at <= time_range.end_iso. "
    "Return monthly_budget and spent in one row."
)

_BUDGET_SPEND_KEYS = ("spent", "total_spent", "spend", "total", "amount")


def _is_budget_question(state: AgentState) -> bool:
    text = f"{latest_user_text(state['messages'])}".lower()
    return "budget" in text


def _budget_spend_guard(state: AgentState) -> str | None:
    """Return a retry hint when a budget question returned no usable spend data."""
    if not _is_budget_question(state):
        return None

    last_result = state.get("last_result") or {}
    if last_result.get("error"):
        return None  # SQL error already handled above

    sql_attempts = state.get("sql_attempts") or []
    last_sql = str((sql_attempts[-1].get("sql") or "") if sql_attempts else "").lower()

    if "transactions" not in last_sql:
        return _BUDGET_HINT

    rows = last_result.get("rows") or []
    if not rows:
        return _BUDGET_HINT

    first_row = rows[0] if isinstance(rows[0], dict) else {}
    if not any(k in first_row for k in _BUDGET_SPEND_KEYS):
        return _BUDGET_HINT

    return None


async def reflect(state: AgentState, config: RunnableConfig) -> dict[str, Any]:
    """Deterministic retry check — no LLM call required."""
    log_node_start(node=_NODE, config=config, state=state)
    start = node_timer()

    last_result = state.get("last_result") or {}
    next_hint: str | None = None

    # SQL execution error → retry with the error message as a hint
    if sql_error := last_result.get("error"):
        next_hint = f"Fix SQL error: {sql_error}"

    # Budget question without transaction spend data → retry with guidance
    if next_hint is None:
        next_hint = _budget_spend_guard(state)

    output = {"next_sql_hint": next_hint, "error": None}
    log_node_complete(
        node=_NODE, config=config, duration_ms=elapsed_ms_since(start), output=output
    )
    return output
