from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from features.agent.schemas import AgentBlockMiniChart
from features.agent.time_range import (
    MAX_DAILY_COMPARISON_DAYS,
    build_daily_range_clarification,
    enrich_cashflow_blocks,
    fill_cashflow_points,
    is_daily_comparison_text,
    resolve_daily_comparison_range,
    resolve_time_range,
)


def test_last_30_days_on_june_13() -> None:
    fixed = datetime(2026, 6, 13, 15, 0, tzinfo=ZoneInfo("Asia/Kolkata"))
    result = resolve_time_range(
        "How much did I spend in the last 30 days?",
        timezone="Asia/Kolkata",
        now=fixed,
    )

    assert result is not None
    assert result["kind"] == "last_n_days"
    assert result["n"] == 30
    assert result["start_date"] == "2026-05-15"
    assert result["end_date"] == "2026-06-13"
    assert result["day_count"] == 30
    assert "30 days" in result["label"]


def test_last_week_is_seven_days() -> None:
    fixed = datetime(2026, 6, 13, 9, 0, tzinfo=ZoneInfo("UTC"))
    result = resolve_time_range("spending last week", timezone="UTC", now=fixed)

    assert result is not None
    assert result["n"] == 7
    assert result["start_date"] == "2026-06-07"
    assert result["end_date"] == "2026-06-13"
    assert result["day_count"] == 7


def test_previous_month_phrase() -> None:
    fixed = datetime(2026, 6, 12, 10, 0, tzinfo=ZoneInfo("Asia/Kolkata"))
    result = resolve_time_range("What about last month?", timezone="Asia/Kolkata", now=fixed)

    assert result is not None
    assert result["kind"] == "previous_month"
    assert result["start_date"] == "2026-05-01"
    assert result["end_date"] == "2026-05-31"


def test_no_phrase_returns_none() -> None:
    result = resolve_time_range(
        "How much on groceries?",
        timezone="Asia/Kolkata",
        now=datetime(2026, 6, 13, tzinfo=ZoneInfo("Asia/Kolkata")),
    )
    assert result is None


def test_monthly_budget_resolves_to_current_month() -> None:
    fixed = datetime(2026, 6, 13, 12, 0, tzinfo=ZoneInfo("Asia/Kolkata"))
    result = resolve_time_range(
        "Am I over my monthly budget?",
        timezone="Asia/Kolkata",
        now=fixed,
    )

    assert result is not None
    assert result["kind"] == "current_month"
    assert result["start_date"] == "2026-06-01"
    assert result["end_date"] == "2026-06-30"


def test_fill_cashflow_points_inserts_zero_days() -> None:
    filled = fill_cashflow_points(
        [{"date": "2026-06-01", "amount": 100}, {"date": "2026-06-03", "amount": 50}],
        start_date="2026-06-01",
        end_date="2026-06-03",
    )

    assert len(filled) == 3
    assert filled[1] == {"date": "2026-06-02", "amount": 0.0}


def test_enrich_cashflow_blocks_gap_fills() -> None:
    block = AgentBlockMiniChart(
        type="mini_chart",
        chart_kind="cashflow",
        payload={
            "title": "Daily",
            "points": [{"date": "2026-05-15", "amount": 200}],
        },
    )
    time_range = {
        "start_date": "2026-05-15",
        "end_date": "2026-05-17",
    }
    enrich_cashflow_blocks([block], time_range)

    points = block.payload["points"]
    assert len(points) == 3
    assert points[1]["date"] == "2026-05-16"
    assert points[1]["amount"] == 0.0
    assert block.payload["start_date"] == "2026-05-15"
    assert block.payload["end_date"] == "2026-05-17"


def test_daily_comparison_asks_when_range_exceeds_30_days() -> None:
    fixed = datetime(2026, 6, 13, 12, 0, tzinfo=ZoneInfo("Asia/Kolkata"))
    resolved = resolve_time_range(
        "daily spending for the last 60 days",
        timezone="Asia/Kolkata",
        now=fixed,
    )
    assert resolved is not None
    assert resolved["n"] == 60

    time_range, clarification = resolve_daily_comparison_range(
        user_text="Show my daily spending for the last 60 days",
        goal="Daily spending for the last 60 days",
        time_range=resolved,
        timezone="Asia/Kolkata",
        now=fixed,
    )

    assert time_range is not None
    assert time_range["day_count"] == 60
    assert clarification is not None
    assert "30 days" in clarification
    assert "60 days" in clarification


def test_aggregate_last_60_days_not_clamped() -> None:
    fixed = datetime(2026, 6, 13, 12, 0, tzinfo=ZoneInfo("Asia/Kolkata"))
    resolved = resolve_time_range(
        "How much did I spend in the last 60 days?",
        timezone="Asia/Kolkata",
        now=fixed,
    )
    time_range, clarification = resolve_daily_comparison_range(
        user_text="How much did I spend in the last 60 days?",
        goal="Total spending for the last 60 days",
        time_range=resolved,
        timezone="Asia/Kolkata",
        now=fixed,
    )

    assert time_range is not None
    assert time_range["day_count"] == 60
    assert clarification is None


def test_daily_without_range_defaults_to_30_days() -> None:
    fixed = datetime(2026, 6, 13, 12, 0, tzinfo=ZoneInfo("UTC"))
    time_range, clarification = resolve_daily_comparison_range(
        user_text="Show my daily spending",
        goal="Daily spending trend",
        time_range=None,
        timezone="UTC",
        now=fixed,
    )

    assert time_range is not None
    assert time_range["day_count"] == MAX_DAILY_COMPARISON_DAYS
    assert time_range["daily_comparison"] is True
    assert clarification is None


def test_build_daily_range_clarification_mentions_requested_window() -> None:
    message = build_daily_range_clarification(
        {
            "label": "14 Apr – 13 Jun 2026 (61 days)",
            "day_count": 61,
        }
    )

    assert "30 days" in message
    assert "61 days" in message
    assert "last 30 days" in message


def test_is_daily_comparison_text_detects_keywords() -> None:
    assert is_daily_comparison_text("Show daily spending")
    assert not is_daily_comparison_text("Top 5 payees")
