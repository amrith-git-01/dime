from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

import asyncpg

from core.config import get_settings
from features.agent.sql_validator import validate_select_sql

logger = logging.getLogger(__name__)

# Module-level connection pool — initialised by init_sql_pool() in app lifespan.
_pool: asyncpg.Pool | None = None


_POOL_RETRY_SECONDS = 10.0
_pool_lock = asyncio.Lock()
_last_pool_attempt = 0.0


async def init_sql_pool() -> bool:
    """Create the asyncpg pool. Never raises: a DB outage at boot must not stop the API.

    Returns ``True`` when a pool exists afterwards. ``ensure_sql_pool`` retries lazily.
    """
    global _pool, _last_pool_attempt
    settings = get_settings()
    if _pool is not None:
        return True
    if not settings.database_url:
        logger.warning("DATABASE_URL not set - agent SQL pool not initialised")
        return False
    _last_pool_attempt = time.monotonic()
    try:
        _pool = await asyncpg.create_pool(
            settings.database_url,
            min_size=settings.agent_sql_pool_min,
            max_size=settings.agent_sql_pool_max,
        )
    except Exception:
        logger.exception("Agent SQL pool init failed; agent returns 503 until it succeeds")
        return False
    logger.info(
        "Agent SQL pool ready (min=%d max=%d)",
        settings.agent_sql_pool_min,
        settings.agent_sql_pool_max,
    )
    return True


async def ensure_sql_pool() -> bool:
    """True when the pool is usable; otherwise retry init (at most every 10 s)."""
    if _pool is not None:
        return True
    async with _pool_lock:
        if _pool is not None:
            return True
        if time.monotonic() - _last_pool_attempt < _POOL_RETRY_SECONDS:
            return False
        return await init_sql_pool()


async def close_sql_pool() -> None:
    """Drain and close the pool. Called at application shutdown."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
        logger.info("Agent SQL pool closed")


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


async def _run_query(
    conn: asyncpg.Connection,
    sql: str,
    claims: str,
    timeout_ms: int,
    start: float,
    max_rows: int,
) -> SQLExecutionResult:
    """Execute one validated SELECT inside a read-only transaction with RLS applied."""
    async with conn.transaction(readonly=True):
        await conn.execute("SELECT set_config('request.jwt.claims', $1, true)", claims)
        await conn.execute("SET LOCAL role authenticated")
        await conn.execute(f"SET LOCAL statement_timeout = '{timeout_ms}ms'")
        records = await conn.fetch(sql)

    rows = [_row_to_dict(r) for r in records]
    columns = list(records[0].keys()) if records else []
    return SQLExecutionResult(
        rows=rows,
        row_count=len(rows),
        columns=columns,
        truncated=len(rows) >= max_rows,
        error=None,
        elapsed_ms=int((time.monotonic() - start) * 1000),
    )


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
            rows=[], row_count=0, columns=[], truncated=False,
            error="DATABASE_URL is not set", elapsed_ms=0,
        )

    validation = validate_select_sql(raw_sql, max_rows=settings.agent_sql_max_rows)
    if not validation.ok:
        return SQLExecutionResult(
            rows=[], row_count=0, columns=[], truncated=False,
            error=validation.error,
            elapsed_ms=int((time.monotonic() - start) * 1000),
        )

    timeout_ms = int(settings.agent_sql_timeout_seconds * 1000)
    claims = json.dumps({"sub": user_id, "role": "authenticated", "aud": "authenticated"})

    try:
        if _pool is not None:
            async with _pool.acquire() as conn:
                return await _run_query(
                    conn, validation.sql, claims, timeout_ms, start,
                    settings.agent_sql_max_rows,
                )
        else:
            # Fallback: open a single connection if pool wasn't initialised.
            conn = await asyncpg.connect(settings.database_url)
            try:
                return await _run_query(
                    conn, validation.sql, claims, timeout_ms, start,
                    settings.agent_sql_max_rows,
                )
            finally:
                await conn.close()
    except Exception as exc:
        return SQLExecutionResult(
            rows=[], row_count=0, columns=[], truncated=False,
            error=f"{type(exc).__name__}: {exc}",
            elapsed_ms=int((time.monotonic() - start) * 1000),
        )
