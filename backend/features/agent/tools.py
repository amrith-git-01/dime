from __future__ import annotations

from langchain_core.tools import tool


@tool
def run_sql(sql: str) -> str:
    """Execute a read-only SELECT query against the user's financial data.

    Args:
        sql: A valid PostgreSQL SELECT statement.

    Returns:
        A JSON-encoded result object with rows and metadata.
    """
    # Execution is handled by execute_sql node which intercepts tool calls.
    # This stub exists solely for schema binding (bind_tools / strict mode).
    raise NotImplementedError("run_sql must be intercepted by execute_sql node")
