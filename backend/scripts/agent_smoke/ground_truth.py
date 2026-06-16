"""Ground-truth SQL for agent smoke tests (RLS via execute_readonly_sql)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from features.agent.sql_executor import execute_readonly_sql
from features.agent.time_range import (
    resolve_compare_range,
    resolve_time_range,
)
from features.transactions.time_bounds import month_bounds_iso, parse_tz


@dataclass(frozen=True, slots=True)
class GroundTruth:
    label: str
    values: dict[str, Any]
    sql_notes: list[str]


async def _scalar(sql: str, *, user_id: str, key: str = "total") -> float:
    result = await execute_readonly_sql(sql, user_id=user_id)
    if result.error:
        msg = f"Ground truth SQL failed: {result.error}"
        raise RuntimeError(msg)
    if not result.rows:
        return 0.0
    row = result.rows[0]
    val = row.get(key, row.get(list(row.keys())[0]))
    return float(val or 0)


async def month_debit_total(
    *, user_id: str, year: int, month: int, tz: str
) -> float:
    start_iso, end_iso = month_bounds_iso(year, month, tz)
    sql = f"""
        SELECT COALESCE(SUM(amount), 0) AS total
        FROM transactions
        WHERE type = 'debit' AND deleted_at IS NULL
          AND transaction_at >= '{start_iso}'
          AND transaction_at <= '{end_iso}'
    """
    return await _scalar(sql, user_id=user_id)


async def payee_month_total(
    *,
    user_id: str,
    payee_normalized: str,
    year: int,
    month: int,
    tz: str,
) -> float:
    start_iso, end_iso = month_bounds_iso(year, month, tz)
    sql = f"""
        SELECT COALESCE(SUM(amount), 0) AS total
        FROM transactions
        WHERE type = 'debit' AND deleted_at IS NULL
          AND counterparty_normalized = '{payee_normalized}'
          AND transaction_at >= '{start_iso}'
          AND transaction_at <= '{end_iso}'
    """
    return await _scalar(sql, user_id=user_id)


async def top_categories_month(
    *, user_id: str, year: int, month: int, tz: str, limit: int = 5
) -> list[dict[str, Any]]:
    start_iso, end_iso = month_bounds_iso(year, month, tz)
    sql = f"""
        SELECT c.name AS category_name, COALESCE(SUM(t.amount), 0) AS total
        FROM transactions t
        LEFT JOIN categories c ON c.id = t.category_id
        WHERE t.type = 'debit' AND t.deleted_at IS NULL
          AND t.transaction_at >= '{start_iso}'
          AND t.transaction_at <= '{end_iso}'
        GROUP BY c.name
        ORDER BY total DESC
        LIMIT {limit}
    """
    result = await execute_readonly_sql(sql, user_id=user_id)
    if result.error:
        msg = f"Ground truth SQL failed: {result.error}"
        raise RuntimeError(msg)
    return result.rows


async def budget_monthly(*, user_id: str) -> float:
    sql = "SELECT monthly_budget AS total FROM budgets LIMIT 1"
    return await _scalar(sql, user_id=user_id)


async def range_debit_total(
    *, user_id: str, start_iso: str, end_iso: str
) -> float:
    sql = f"""
        SELECT COALESCE(SUM(amount), 0) AS total
        FROM transactions
        WHERE type = 'debit' AND deleted_at IS NULL
          AND transaction_at >= '{start_iso}'
          AND transaction_at <= '{end_iso}'
    """
    return await _scalar(sql, user_id=user_id)


async def ground_truth_for_question(
    *,
    question: str,
    user_id: str,
    timezone: str,
    now,
) -> GroundTruth | None:
    """Compute expected values for a smoke scenario question."""
    notes: list[str] = []

    compare = resolve_compare_range(question, timezone=timezone, now=now)
    if compare is not None:
        pa = compare["period_a"]
        pb = compare["period_b"]
        a_total = await range_debit_total(
            user_id=user_id,
            start_iso=pa["start_iso"],
            end_iso=pa["end_iso"],
        )
        b_total = await range_debit_total(
            user_id=user_id,
            start_iso=pb["start_iso"],
            end_iso=pb["end_iso"],
        )
        notes.append(f"compare period_a: {pa['label']}")
        notes.append(f"compare period_b: {pb['label']}")
        return GroundTruth(
            label=compare["label"],
            values={
                "kind": "compare",
                "period_a_total": a_total,
                "period_b_total": b_total,
                "period_a_label": pa["label"],
                "period_b_label": pb["label"],
            },
            sql_notes=notes,
        )

    time_range = resolve_time_range(question, timezone=timezone, now=now)
    if time_range is None:
        return None

    total = await range_debit_total(
        user_id=user_id,
        start_iso=time_range["start_iso"],
        end_iso=time_range["end_iso"],
    )
    notes.append(f"range: {time_range['label']}")

    values: dict[str, Any] = {
        "kind": time_range["kind"],
        "total": total,
        "time_range_label": time_range.get("label"),
    }

    if "budget" in question.lower():
        values["monthly_budget"] = await budget_monthly(user_id=user_id)

    if "categories" in question.lower() or "category" in question.lower():
        tz_obj = parse_tz(timezone)
        local = now.astimezone(tz_obj)
        rows = await top_categories_month(
            user_id=user_id,
            year=local.year,
            month=local.month,
            tz=timezone,
        )
        values["top_categories"] = rows
        if rows:
            values["top_category_name"] = rows[0].get("category_name")
            values["top_category_total"] = float(rows[0].get("total") or 0)

    if "zomato" in question.lower():
        tz = parse_tz(timezone)
        local = now.astimezone(tz)
        values["payee_total"] = await payee_month_total(
            user_id=user_id,
            payee_normalized="zomato",
            year=local.year,
            month=local.month,
            tz=timezone,
        )
        values["payee_id"] = "zomato"

    if "uber" in question.lower():
        tz = parse_tz(timezone)
        local = now.astimezone(tz)
        values["payee_total"] = await payee_month_total(
            user_id=user_id,
            payee_normalized="uber india",
            year=local.year,
            month=local.month,
            tz=timezone,
        )
        values["payee_id"] = "uber india"

    return GroundTruth(label=str(time_range.get("label")), values=values, sql_notes=notes)
