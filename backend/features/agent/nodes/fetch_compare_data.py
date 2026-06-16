"""Graph node: pre-fetch InsightsService data for compare queries.

Handles two subkinds:
  - "month_pair"  → daily cashflow + payees per month via fetch_compare_insights
  - "year_pair"   → monthly aggregation across all months via fetch_year_compare_insights

Both paths populate state["compare_insights"] (LLM prose context) and
state["ui_blocks"] (the compare_months block for the frontend).
"""

from __future__ import annotations

from typing import Any

from langchain_core.runnables import RunnableConfig

from features.agent.compare_insights import (
    fetch_compare_insights,
    fetch_year_compare_insights,
)
from features.agent.state import AgentState
from features.agent.trace import (
    elapsed_ms_since,
    log_node_complete,
    log_node_error,
    log_node_start,
    node_timer,
)

_NODE = "fetch_compare_data"


async def fetch_compare_data(
    state: AgentState, config: RunnableConfig
) -> dict[str, Any]:
    log_node_start(node=_NODE, config=config, state=state)
    start = node_timer()

    cfg = config.get("configurable") or {}
    user_id: str = cfg["user_id"]
    timezone: str | None = cfg.get("timezone")
    time_range = state.get("time_range") or {}
    subkind = time_range.get("subkind", "month_pair")

    try:
        if subkind == "year_pair":
            block, summary = await fetch_year_compare_insights(
                user_id, time_range, timezone=timezone
            )
        else:
            block, summary = await fetch_compare_insights(
                user_id, time_range, timezone=timezone
            )

        output: dict[str, Any] = {
            "compare_insights": summary,
            "last_result": {
                "row_count": 2,
                "rows": [
                    {
                        "period": summary["period_a_label"],
                        "period_a_amount": summary["period_a"]["spent"],
                        "period_b_amount": summary["period_b"]["spent"],
                    }
                ],
                "columns": ["period", "period_a_amount", "period_b_amount"],
                "truncated": False,
                "error": None,
            },
            "ui_blocks": [block],
        }

        log_node_complete(
            node=_NODE,
            config=config,
            duration_ms=elapsed_ms_since(start),
            output={
                "subkind": subkind,
                "period_a": summary["period_a_label"],
                "period_b": summary["period_b_label"],
            },
        )
        return output

    except Exception as exc:
        log_node_error(
            node=_NODE, config=config, duration_ms=elapsed_ms_since(start), error=str(exc)
        )
        raise
