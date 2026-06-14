from __future__ import annotations

import json

from langchain_core.runnables import RunnableConfig
from langchain_core.tools import tool

from features.agent.schema_context import get_schema_doc, list_tables_summary
from features.agent.sql_executor import execute_readonly_sql


def _user_id(config: RunnableConfig) -> str:
    uid = (config.get("configurable") or {}).get("user_id")
    if not uid:
        raise ValueError("user_id is required")
    return str(uid)


def _user_jwt(config: RunnableConfig) -> str | None:
    token = (config.get("configurable") or {}).get("user_jwt")
    return str(token) if token else None


@tool
async def run_sql(sql: str, config: RunnableConfig) -> str:
    """Execute a read-only SELECT against the user's finance data."""
    result = await execute_readonly_sql(
        sql,
        user_id=_user_id(config),
        user_jwt=_user_jwt(config),
    )

    return json.dumps({
        "rows": result.rows,
        "row_count": result.row_count,
        "columns": result.columns,
        "truncated": result.truncated,
        "error": result.error,
        "elapsed_ms": result.elapsed_ms,
    })


@tool
def describe_schema() -> str:
    """Return schema documentation: tables, columns, joins, and examples."""
    return get_schema_doc()


@tool
def list_tables() -> str:
    """Return allowlisted table names the agent may query."""
    return list_tables_summary()


AGENT_TOOLS = [run_sql, describe_schema, list_tables]
