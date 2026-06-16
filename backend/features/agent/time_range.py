"""Resolve relative date phrases to authoritative inclusive calendar ranges.

Single-period resolution (today, last N days, this month, etc.) is handled
deterministically here.  Comparison routing ("june vs may", "YoY") is handled
by the classify_intent graph node via build_compare_time_range().
"""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from typing import Any, Literal

from features.agent.timezone_context import _last_n_days_bounds_from_ref, _local_now
from features.transactions.time_bounds import (
    day_bounds_iso,
    month_bounds_iso,
    parse_tz,
    previous_month_bounds_iso,
)

TimeRangeKind = Literal[
    "last_n_days",
    "current_month",
    "previous_month",
    "calendar_year",
    "today",
    "yesterday",
    "compare",
]

_LAST_N_DAYS_RE = re.compile(r"\b(?:last|past)\s+(\d+)\s+days?\b", re.IGNORECASE)
_LAST_WEEK_RE = re.compile(r"\b(?:last|past)\s+week\b", re.IGNORECASE)
_THIS_MONTH_RE = re.compile(r"\b(?:this|current)\s+month\b", re.IGNORECASE)
_MONTHLY_BUDGET_RE = re.compile(
    r"\b(?:monthly\s+budget|over\s+(?:my\s+)?(?:monthly\s+)?budget|"
    r"within\s+(?:my\s+)?(?:monthly\s+)?budget|under\s+(?:my\s+)?budget|"
    r"budget\s+status)\b",
    re.IGNORECASE,
)
_PREVIOUS_MONTH_RE = re.compile(
    r"\b(?:previous|prior)\s+month\b|\blast\s+month\b",
    re.IGNORECASE,
)
_THIS_YEAR_RE = re.compile(r"\b(?:this|current)\s+year\b", re.IGNORECASE)
_TODAY_RE = re.compile(r"\btoday\b", re.IGNORECASE)
_YESTERDAY_RE = re.compile(r"\byesterday\b", re.IGNORECASE)
_DAILY_COMPARISON_RE = re.compile(
    r"\b(?:daily|day[\s-]by[\s-]day|per\s+day|each\s+day|every\s+day|"
    r"day[\s-]to[\s-]day|by\s+day|busiest\s+day|peak\s+day)\b",
    re.IGNORECASE,
)

MAX_DAILY_COMPARISON_DAYS = 40


def is_daily_comparison_text(text: str) -> bool:
    return bool(_DAILY_COMPARISON_RE.search(text))


def _iso_to_date(iso: str) -> date:
    return date.fromisoformat(iso[:10])


def _format_label(start: date, end: date, day_count: int) -> str:
    if start.year == end.year:
        if start.month == end.month:
            return f"{start.day}–{end.day} {end.strftime('%b %Y')} ({day_count} days)"
        return f"{start.strftime('%d %b')} – {end.strftime('%d %b %Y')} ({day_count} days)"
    return f"{start.strftime('%d %b %Y')} – {end.strftime('%d %b %Y')} ({day_count} days)"


def _pack_range(
    *,
    kind: TimeRangeKind,
    start_iso: str,
    end_iso: str,
    n: int | None = None,
) -> dict[str, Any]:
    start_day = _iso_to_date(start_iso)
    end_day = _iso_to_date(end_iso)
    day_count = (end_day - start_day).days + 1
    return {
        "kind": kind,
        "n": n,
        "start_date": start_day.isoformat(),
        "end_date": end_day.isoformat(),
        "day_count": day_count,
        "start_iso": start_iso,
        "end_iso": end_iso,
        "label": _format_label(start_day, end_day, day_count),
    }


def resolve_time_range(
    text: str,
    *,
    timezone: str | None,
    now: datetime | None = None,
) -> dict[str, Any] | None:
    """Map common relative phrases to an inclusive local-date window.

    Only handles single-period phrases (today, last N days, this month, etc.).
    Comparison phrases are detected by the classify_intent graph node.
    """
    if not text.strip():
        return None

    tz_name, ref = _local_now(timezone, now)
    tz = parse_tz(tz_name)
    local_day = ref.astimezone(tz).date()

    match = _LAST_N_DAYS_RE.search(text)
    if match:
        n = int(match.group(1))
        if n < 1:
            return None
        start_iso, end_iso = _last_n_days_bounds_from_ref(n, ref, tz_name)
        return _pack_range(kind="last_n_days", start_iso=start_iso, end_iso=end_iso, n=n)

    if _LAST_WEEK_RE.search(text):
        start_iso, end_iso = _last_n_days_bounds_from_ref(7, ref, tz_name)
        return _pack_range(kind="last_n_days", start_iso=start_iso, end_iso=end_iso, n=7)

    if _YESTERDAY_RE.search(text):
        day = local_day - timedelta(days=1)
        start_iso, end_iso = day_bounds_iso(day, tz_name)
        return _pack_range(kind="yesterday", start_iso=start_iso, end_iso=end_iso)

    if _TODAY_RE.search(text):
        start_iso, end_iso = day_bounds_iso(local_day, tz_name)
        return _pack_range(kind="today", start_iso=start_iso, end_iso=end_iso)

    if _THIS_MONTH_RE.search(text):
        local = ref.astimezone(tz)
        start_iso, end_iso = month_bounds_iso(local.year, local.month, tz_name)
        return _pack_range(kind="current_month", start_iso=start_iso, end_iso=end_iso)

    if _MONTHLY_BUDGET_RE.search(text):
        local = ref.astimezone(tz)
        start_iso, end_iso = month_bounds_iso(local.year, local.month, tz_name)
        return _pack_range(kind="current_month", start_iso=start_iso, end_iso=end_iso)

    if _PREVIOUS_MONTH_RE.search(text):
        start_iso, end_iso = previous_month_bounds_iso(tz_name, now=ref)
        return _pack_range(kind="previous_month", start_iso=start_iso, end_iso=end_iso)

    if _THIS_YEAR_RE.search(text):
        year_start = date(local_day.year, 1, 1)
        start_iso, _ = day_bounds_iso(year_start, tz_name)
        _, end_iso = day_bounds_iso(local_day, tz_name)
        return _pack_range(kind="calendar_year", start_iso=start_iso, end_iso=end_iso)

    return None


def spans_multiple_calendar_months(time_range: dict[str, Any] | None) -> bool:
    if not time_range:
        return False
    if time_range.get("kind") == "calendar_year":
        return True
    start_raw = time_range.get("start_date")
    end_raw = time_range.get("end_date")
    if not isinstance(start_raw, str) or not isinstance(end_raw, str):
        return False
    start = _iso_to_date(start_raw)
    end = _iso_to_date(end_raw)
    return start.year != end.year or start.month != end.month


def build_daily_range_clarification(time_range: dict[str, Any]) -> str:
    label = str(time_range.get("label") or "that range")
    day_count = int(time_range.get("day_count") or 0)
    return (
        f"I can chart daily spending for up to **{MAX_DAILY_COMPARISON_DAYS} days** at a time. "
        f"You asked for **{label}** ({day_count} days), which is a bit long for a day-by-day view.\n\n"
        f"Try a shorter window — for example, \"daily spending for the last 40 days\" "
        f"or \"show my daily spending this week\". If you want the full **{day_count}-day** total "
        f"without a daily chart, just ask for total spending over that period."
    )


def resolve_daily_comparison_range(
    *,
    user_text: str,
    goal: str,
    time_range: dict[str, Any] | None,
    timezone: str | None,
    now: datetime | None = None,
) -> tuple[dict[str, Any] | None, str | None]:
    """Tag time_range for per-day requests and enforce the MAX_DAILY_COMPARISON_DAYS cap."""
    is_daily = is_daily_comparison_text(user_text) or is_daily_comparison_text(goal)
    if not is_daily:
        return time_range, None

    tz_name, ref = _local_now(timezone, now)
    if time_range is None:
        start_iso, end_iso = _last_n_days_bounds_from_ref(
            MAX_DAILY_COMPARISON_DAYS, ref, tz_name
        )
        defaulted = _pack_range(
            kind="last_n_days",
            start_iso=start_iso,
            end_iso=end_iso,
            n=MAX_DAILY_COMPARISON_DAYS,
        )
        defaulted["daily_comparison"] = True
        return defaulted, None

    day_count = int(time_range.get("day_count") or 0)
    if day_count > MAX_DAILY_COMPARISON_DAYS:
        return time_range, build_daily_range_clarification(time_range)

    tagged = dict(time_range)
    tagged["daily_comparison"] = True
    return tagged, None


def fill_cashflow_points(
    points: list[dict[str, Any]],
    *,
    start_date: str,
    end_date: str,
) -> list[dict[str, Any]]:
    """Ensure one point per calendar day in [start_date, end_date] inclusive."""
    start = date.fromisoformat(start_date)
    end = date.fromisoformat(end_date)
    if end < start:
        return points

    by_date: dict[str, float] = {}
    for point in points:
        raw_date = str(point.get("date", ""))[:10]
        amount = point.get("amount")
        if not raw_date or not isinstance(amount, (int, float)):
            continue
        by_date[raw_date] = float(amount)

    filled: list[dict[str, Any]] = []
    cursor = start
    while cursor <= end:
        key = cursor.isoformat()
        filled.append({"date": key, "amount": by_date.get(key, 0.0)})
        cursor += timedelta(days=1)
    return filled


def enrich_cashflow_blocks(
    blocks: list[Any],
    time_range: dict[str, Any] | None,
) -> None:
    """Attach authoritative range metadata and gap-filled points to cashflow blocks."""
    if not time_range:
        return

    start_date = time_range.get("start_date")
    end_date = time_range.get("end_date")
    if not isinstance(start_date, str) or not isinstance(end_date, str):
        return

    for block in blocks:
        if getattr(block, "chart_kind", None) != "cashflow":
            continue
        payload = dict(block.payload)
        payload["start_date"] = start_date
        payload["end_date"] = end_date
        raw_points = payload.get("points") or []
        if isinstance(raw_points, list):
            filled = fill_cashflow_points(
                [p for p in raw_points if isinstance(p, dict)],
                start_date=start_date,
                end_date=end_date,
            )
            payload["points"] = filled[:MAX_DAILY_COMPARISON_DAYS]
        block.payload = payload


def build_compare_time_range(
    comparison_kind: str,
    period_a: dict[str, Any],
    period_b: dict[str, Any],
    *,
    tz_name: str,
    today: date,
) -> dict[str, Any]:
    """Convert LLM-classified period dicts to an authoritative compare time_range.

    Called by the classify_intent node — pure date arithmetic, no LLM.
    """
    if comparison_kind == "month_pair":
        year_a, month_a = int(period_a["year"]), int(period_a["month"])
        year_b, month_b = int(period_b["year"]), int(period_b["month"])
        a_start, a_end = month_bounds_iso(year_a, month_a, tz_name)
        b_start, b_end = month_bounds_iso(year_b, month_b, tz_name)
        label_a = date(year_a, month_a, 1).strftime("%b %Y")
        label_b = date(year_b, month_b, 1).strftime("%b %Y")
        return {
            "kind": "compare",
            "subkind": "month_pair",
            "period_a": {"start_iso": a_start, "end_iso": a_end, "label": label_a},
            "period_b": {"start_iso": b_start, "end_iso": b_end, "label": label_b},
            "label": f"{label_a} vs {label_b}",
        }

    if comparison_kind == "year_pair":
        year_a = int(period_a["year"])
        ytd_a = bool(period_a.get("ytd", False))
        year_b = int(period_b["year"])
        ytd_b = bool(period_b.get("ytd", False))

        a_start, _ = day_bounds_iso(date(year_a, 1, 1), tz_name)
        if ytd_a:
            _, a_end = day_bounds_iso(today, tz_name)
            label_a = f"{year_a} (YTD)"
        else:
            _, a_end = day_bounds_iso(date(year_a, 12, 31), tz_name)
            label_a = str(year_a)

        b_start, _ = day_bounds_iso(date(year_b, 1, 1), tz_name)
        if ytd_b:
            _, b_end = day_bounds_iso(today, tz_name)
            label_b = f"{year_b} (YTD)"
        else:
            _, b_end = day_bounds_iso(date(year_b, 12, 31), tz_name)
            label_b = str(year_b)

        return {
            "kind": "compare",
            "subkind": "year_pair",
            "period_a": {"start_iso": a_start, "end_iso": a_end, "label": label_a},
            "period_b": {"start_iso": b_start, "end_iso": b_end, "label": label_b},
            "label": f"{label_a} vs {label_b}",
        }

    msg = f"Unknown comparison_kind: {comparison_kind!r}"
    raise ValueError(msg)
