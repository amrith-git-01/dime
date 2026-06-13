from  __future__ import annotations

import json
import time
from dataclasses import dataclass
from datetime import datetime, date
from decimal import Decimal
from typing import Any
from uuid import UUID

import asyncpg

from core.config import get_settings
from features.agent.sql_validator import validate_select_sql

@dataclass(frozen=True, slots=True)
class SQLExecutionResult:
    rows: list[dict[str, Any]]
    row_count: int
    columns: list[str]
    truncated: bool
    error: str | None
    elapsed_ms: int

def _json_safe(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, UUID):
        return str(value)
    return value

def _row_to_dict(record: asyncpg.Record) -> dict[str, Any]:
    return {key: _json_safe(record[key]) for key in record.keys()}

async def execute_readonly_sql(
    raw_sql: str,
    *,
    user_id: str,
    user_jwt: str | None = None,
) -> SQLExecutionResult:
    settings = get_settings()
    start = time.monotonic()

    if not settings.database_url:
        return SQLExecutionResult(
            rows=[],
            row_count=0,
            columns=[],
            truncated=False,
            error="DATABASE_URL is not set",
            elapsed_ms=0,
        )
    validation = validate_select_sql(raw_sql, max_rows=settings.agent_sql_max_rows)

    if not validation.ok:
        return SQLExecutionResult(
            rows=[],
            row_count=0,
            columns=[],
            truncated=False,
            error=validation.error,
            elapsed_ms=int((time.monotonic() - start) * 1000),
        )

    timeout_ms = int(settings.agent_sql_timeout_seconds * 1000)
    claims = json.dumps({
        "sub": user_id,
        "role" : "authenticated",
        "aud": "authenticated",
    })

    try: 
        conn = await asyncpg.connect(settings.database_url)
        try: 
            async with conn.transaction():
                await conn.execute("SELECT set_config('request.jwt.claims', $1, true)", claims)

                await conn.execute("SET LOCAL role authenticated")

                await conn.execute(
                    f"SET LOCAL statement_timeout = '{timeout_ms}ms'"
                )

                records = await conn.fetch(validation.sql)
        finally: 
            await conn.close()
        
        rows = [_row_to_dict(r) for r in records]
        columns = list(records[0].keys()) if records else []
        elapsed_ms = int((time.monotonic() - start) * 1000)

        return SQLExecutionResult(
            rows = rows,
            row_count = len(rows),
            columns = columns,
            truncated=len(rows) >= settings.agent_sql_max_rows,
            error=None,
            elapsed_ms=elapsed_ms,
        )

    except Exception as exc:
        return SQLExecutionResult(
            rows=[],
            row_count=0,
            columns=[],
            truncated=False,
            error=f"{type(exc).__name__}: {exc}",
            elapsed_ms=int((time.monotonic() - start) * 1000),
        )