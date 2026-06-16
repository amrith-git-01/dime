from __future__ import annotations

import json
from typing import Any

from langchain_core.messages import ToolMessage
from langchain_core.runnables import RunnableConfig

from features.agent.schemas import SqlAttempt
from features.agent.sql_executor import execute_readonly_sql
from features.agent.state import AgentState
from features.agent.trace import (
    elapsed_ms_since,
    log_node_complete,
    log_node_error,
    log_node_start,
    log_sql_execution,
    node_timer,
)

_NODE = "execute_sql"


def _extract_run_sql_call(state: AgentState) -> tuple[str, str] | None:
    if not state["messages"]:
        return None
    last = state["messages"][-1]
    tool_calls = getattr(last, "tool_calls", None) or []
    for tc in tool_calls:
        name = tc.get("name") if isinstance(tc, dict) else getattr(tc, "name", None)
        if name != "run_sql":
            continue
        args = tc.get("args") if isinstance(tc, dict) else getattr(tc, "args", {})
        sql = args.get("sql") if isinstance(args, dict) else None
        tc_id = tc.get("id") if isinstance(tc, dict) else getattr(tc, "id", "run_sql")
        if isinstance(sql, str) and sql.strip():
            return sql.strip(), str(tc_id)
    return None


async def execute_sql(state: AgentState, config: RunnableConfig) -> dict[str, Any]:
    log_node_start(node=_NODE, config=config, state=state)
    start = node_timer()
    try:
        extracted = _extract_run_sql_call(state)
        if extracted is None:
            output = {"error": "No run_sql tool call found on last message"}
            log_node_complete(
                node=_NODE, config=config, duration_ms=elapsed_ms_since(start), output=output
            )
            return output

        sql, tool_call_id = extracted
        round_no = state.get("query_rounds", 0) + 1

        cfg = config.get("configurable") or {}
        user_id: str = cfg.get("user_id", "")
        user_jwt: str | None = cfg.get("user_jwt")

        execution = await execute_readonly_sql(sql, user_id=user_id, user_jwt=user_jwt)
        result = {
            "rows": execution.rows,
            "row_count": execution.row_count,
            "columns": execution.columns,
            "truncated": execution.truncated,
            "error": execution.error,
            "elapsed_ms": execution.elapsed_ms,
        }
        result_str = json.dumps(result, default=str)

        log_sql_execution(
            node=_NODE,
            config=config,
            sql=sql,
            result=result,
            round_no=round_no,
        )

        attempt = SqlAttempt(
            sql=sql,
            row_count=int(result.get("row_count") or 0),
            error=result.get("error"),
            elapsed_ms=int(result.get("elapsed_ms") or 0),
            round=round_no,
        )
        output = {
            "messages": [ToolMessage(content=result_str, tool_call_id=tool_call_id)],
            "last_result": result,
            "sql_attempts": [*state.get("sql_attempts", []), attempt.model_dump()],
            "query_rounds": round_no,
            "error": None,
        }
        log_node_complete(
            node=_NODE, config=config, duration_ms=elapsed_ms_since(start), output=output
        )
        return output
    except Exception as exc:
        log_node_error(
            node=_NODE, config=config, duration_ms=elapsed_ms_since(start), error=str(exc)
        )
        raise
