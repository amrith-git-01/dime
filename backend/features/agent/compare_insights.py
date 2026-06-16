"""Fetch InsightsService data for both compare periods.

Provides:
- _period_payload()        → serialisable dict for the compare_months UI block
- build_compare_summary()  → compact dict given to the LLM for prose generation
- fetch_compare_insights() → fetches both months and returns (block_dict, summary_dict)
"""

from __future__ import annotations

import asyncio
from datetime import date
from typing import Any

from core.async_utils import run_sync
from core.db import create_supabase_service_client
from core.security import CurrentUser
from features.insights.schemas import MonthInsightsResponse, YearInsightsResponse
from features.insights.service import InsightsService


def _period_to_year_month(period: dict[str, Any]) -> tuple[int, int]:
    d = date.fromisoformat(period["start_iso"][:10])
    return d.year, d.month


def _period_payload(insights: MonthInsightsResponse) -> dict[str, Any]:
    """Serialisable payload for the compare_months UI block (frontend).

    All numeric fields are floats for consistent JSON serialisation.
    """
    cashflow = [
        {
            "date": row.date,
            "expense": float(row.debit_total),
            "income": float(row.credit_total),
        }
        for row in insights.daily_cashflow
    ]
    payees = [
        {
            "name": row.display_name,
            "amount": float(row.debit_total),
            "share": row.share,
        }
        for row in insights.counterparty_spend
        if row.payee_key != "__other__"
    ]
    return {
        "spent": float(insights.summary.debit_total),
        "income": float(insights.summary.credit_total),
        "net": float(insights.summary.net),
        "cashflow": cashflow,
        "payees": payees,
    }


def _cashflow_stats(cashflow: list[dict[str, Any]]) -> dict[str, Any]:
    """Derive spending pattern metrics from daily cashflow for the LLM."""
    active_days = [d for d in cashflow if d["expense"] > 0]
    if not active_days:
        return {"active_days": 0, "peak_date": None, "peak_amount": 0}
    peak = max(active_days, key=lambda d: d["expense"])
    return {
        "active_days": len(active_days),
        "peak_date": peak["date"],
        "peak_amount": peak["expense"],
    }


def _pct_change(new: float, old: float) -> float | None:
    if old == 0:
        return None
    return round((new - old) / old * 100, 1)


def build_compare_summary(
    payload_a: dict[str, Any],
    payload_b: dict[str, Any],
    *,
    label_a: str,
    label_b: str,
) -> dict[str, Any]:
    """Compact summary dict passed to the LLM for prose generation.

    Accepts pre-computed _period_payload dicts to avoid redundant computation.
    Contains totals, deltas, cashflow patterns, and top payees.
    """
    spent_a, income_a, net_a = payload_a["spent"], payload_a["income"], payload_a["net"]
    spent_b, income_b, net_b = payload_b["spent"], payload_b["income"], payload_b["net"]

    cf_a = _cashflow_stats(payload_a["cashflow"])
    cf_b = _cashflow_stats(payload_b["cashflow"])

    return {
        "period_a_label": label_a,
        "period_b_label": label_b,
        "period_a": {
            "spent": spent_a,
            "income": income_a,
            "net": net_a,
            "active_spend_days": cf_a["active_days"],
            "peak_spend_date": cf_a["peak_date"],
            "peak_spend_amount": cf_a["peak_amount"],
            "top_payees": payload_a["payees"][:4],
        },
        "period_b": {
            "spent": spent_b,
            "income": income_b,
            "net": net_b,
            "active_spend_days": cf_b["active_days"],
            "peak_spend_date": cf_b["peak_date"],
            "peak_spend_amount": cf_b["peak_amount"],
            "top_payees": payload_b["payees"][:4],
        },
        "deltas": {
            "spent_pct": _pct_change(spent_a, spent_b),
            "income_pct": _pct_change(income_a, income_b),
            "net_pct": _pct_change(net_a, net_b),
            "active_days_delta": cf_a["active_days"] - cf_b["active_days"],
        },
    }


async def fetch_compare_insights(
    user_id: str,
    time_range: dict[str, Any],
    *,
    timezone: str | None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Fetch both months from InsightsService.

    Returns:
        (compare_months_block, compare_summary)
        - compare_months_block: UI block dict (type="compare_months")
        - compare_summary: compact dict for the LLM respond prompt
    """
    tz = timezone or "Asia/Kolkata"
    period_a = time_range["period_a"]
    period_b = time_range["period_b"]
    year_a, month_a = _period_to_year_month(period_a)
    year_b, month_b = _period_to_year_month(period_b)

    supabase = create_supabase_service_client()
    service = InsightsService(supabase)
    user = CurrentUser(id=user_id)

    insights_a, insights_b = await asyncio.gather(
        run_sync(service.month_insights, user, year=year_a, month=month_a, timezone=tz),
        run_sync(service.month_insights, user, year=year_b, month=month_b, timezone=tz),
    )

    label_a = period_a.get("label", "Period A")
    label_b = period_b.get("label", "Period B")

    pa = _period_payload(insights_a)
    pb = _period_payload(insights_b)

    block = {
        "type": "compare_months",
        "period_a_label": label_a,
        "period_b_label": label_b,
        "period_a": pa,
        "period_b": pb,
    }
    summary = build_compare_summary(pa, pb, label_a=label_a, label_b=label_b)
    return block, summary


# kept for backwards-compat callsites
async def fetch_compare_months_block(
    user_id: str,
    time_range: dict[str, Any],
    *,
    timezone: str | None,
) -> dict[str, Any]:
    block, _ = await fetch_compare_insights(user_id, time_range, timezone=timezone)
    return block


# ── Year-pair comparison ──────────────────────────────────────────────────────

_MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
               "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _year_insights_payload(ins: YearInsightsResponse) -> dict[str, Any]:
    """Convert YearInsightsResponse into the compare_months block payload format."""
    cashflow = [
        {
            "date": row.date,
            "expense": float(row.debit_total),
            "income": float(row.credit_total),
        }
        for row in ins.monthly_cashflow
    ]
    payees = [
        {
            "name": p.display_name,
            "amount": float(p.debit_total),
            "share": p.share,
        }
        for p in ins.top_payees
        if p.payee_key != "__other__"
    ]
    return {
        "spent": float(ins.summary.debit_total),
        "income": float(ins.summary.credit_total),
        "net": float(ins.summary.net),
        "cashflow": cashflow,
        "payees": payees,
    }


def _year_cashflow_stats(cashflow: list[dict[str, Any]]) -> dict[str, Any]:
    active = [d for d in cashflow if d["expense"] > 0]
    if not active:
        return {"active_months": 0, "peak_month": None, "peak_amount": 0}
    peak = max(active, key=lambda d: d["expense"])
    try:
        month_idx = int(peak["date"][5:7]) - 1
        peak_label = _MONTH_ABBR[month_idx]
    except (IndexError, ValueError):
        peak_label = peak["date"]
    return {
        "active_months": len(active),
        "peak_month": peak_label,
        "peak_amount": peak["expense"],
    }


def build_year_compare_summary(
    payload_a: dict[str, Any],
    payload_b: dict[str, Any],
    *,
    label_a: str,
    label_b: str,
) -> dict[str, Any]:
    """Compact summary dict for the LLM respond prompt (year comparison)."""
    spent_a, income_a, net_a = payload_a["spent"], payload_a["income"], payload_a["net"]
    spent_b, income_b, net_b = payload_b["spent"], payload_b["income"], payload_b["net"]

    cf_a = _year_cashflow_stats(payload_a["cashflow"])
    cf_b = _year_cashflow_stats(payload_b["cashflow"])

    return {
        "period_a_label": label_a,
        "period_b_label": label_b,
        "period_a": {
            "spent": spent_a,
            "income": income_a,
            "net": net_a,
            "active_spend_months": cf_a["active_months"],
            "peak_spend_month": cf_a["peak_month"],
            "peak_spend_amount": cf_a["peak_amount"],
            "top_payees": payload_a["payees"][:4],
        },
        "period_b": {
            "spent": spent_b,
            "income": income_b,
            "net": net_b,
            "active_spend_months": cf_b["active_months"],
            "peak_spend_month": cf_b["peak_month"],
            "peak_spend_amount": cf_b["peak_amount"],
            "top_payees": payload_b["payees"][:4],
        },
        "deltas": {
            "spent_pct": _pct_change(spent_a, spent_b),
            "income_pct": _pct_change(income_a, income_b),
            "net_pct": _pct_change(net_a, net_b),
        },
    }


async def fetch_year_compare_insights(
    user_id: str,
    time_range: dict[str, Any],
    *,
    timezone: str | None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Fetch both year periods with 2 DB calls (3 queries each) via year_insights().

    Replaces the previous approach of N parallel month_insights calls (up to 18).
    Returns (compare_months_block, compare_summary).
    """
    tz = timezone or "Asia/Kolkata"
    period_a = time_range["period_a"]
    period_b = time_range["period_b"]

    supabase = create_supabase_service_client()
    service = InsightsService(supabase)
    user = CurrentUser(id=user_id)

    insights_a, insights_b = await asyncio.gather(
        run_sync(
            service.year_insights,
            user,
            from_iso=period_a["start_iso"],
            to_iso=period_a["end_iso"],
            timezone=tz,
        ),
        run_sync(
            service.year_insights,
            user,
            from_iso=period_b["start_iso"],
            to_iso=period_b["end_iso"],
            timezone=tz,
        ),
    )

    label_a = period_a.get("label", str(insights_a.year))
    label_b = period_b.get("label", str(insights_b.year))

    payload_a = _year_insights_payload(insights_a)
    payload_b = _year_insights_payload(insights_b)

    block: dict[str, Any] = {
        "type": "compare_months",
        "chart_label": "Monthly Spend",
        "period_a_label": label_a,
        "period_b_label": label_b,
        "period_a": payload_a,
        "period_b": payload_b,
    }
    summary = build_year_compare_summary(payload_a, payload_b, label_a=label_a, label_b=label_b)
    return block, summary
