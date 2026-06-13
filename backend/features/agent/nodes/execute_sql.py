from __future__ import annotations

import json
from typing import Any

from langchain_core.messages import ToolMessage
from langchain_core.runnables import RunnableConfig

from features.agent.schemas import SqlAttempt
from features.agent.state import AgentState
from features.agent.tools import run_sql

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
    extracted = _extract_run_sql_call(state)
    if extracted is None:
        return {"error": "No run_sql tool call found on last message"}
    sql, tool_call_id = extracted
    round_no = state.get("query_rounds", 0) + 1
    result_str = await run_sql.ainvoke({"sql": sql}, config=config)
    result = json.loads(result_str)
    attempt = SqlAttempt(
        sql=sql,
        row_count=int(result.get("row_count") or 0),
        error=result.get("error"),
        elapsed_ms=int(result.get("elapsed_ms") or 0),
        round=round_no,
    )
    return {
        "messages": [ToolMessage(content=result_str, tool_call_id=tool_call_id)],
        "last_result": result,
        "sql_attempts": [*state.get("sql_attempts", []), attempt.model_dump()],
        "query_rounds": round_no,
        "error": None,
    }