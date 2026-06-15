from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from features.agent.timezone_context import (
    prepend_temporal_context,
    temporal_context_section,
)
from features.transactions.time_bounds import previous_month_bounds_iso


def test_temporal_context_section_includes_timezone_and_ranges() -> None:
    fixed = datetime(2026, 6, 12, 10, 30, tzinfo=ZoneInfo("Asia/Kolkata"))
    section = temporal_context_section("Asia/Kolkata", now=fixed)

    assert "Asia/Kolkata" in section
    assert "2026-06-12" in section
    assert "Current month" in section
    assert "2026-06-01 → 2026-06-30" in section
    assert "Previous month" in section
    assert "2026-05-01 → 2026-05-31" in section
    assert "Last 7 days" in section
    assert "Last 30 days" in section
    assert "authoritative" in section


def test_temporal_context_previous_month_year_boundary() -> None:
    fixed = datetime(2026, 1, 15, 9, 0, tzinfo=ZoneInfo("Asia/Kolkata"))
    section = temporal_context_section("Asia/Kolkata", now=fixed)

    assert "2025-12-01 → 2025-12-31" in section
    assert previous_month_bounds_iso("Asia/Kolkata", now=fixed)[0].startswith(
        "2025-12-01"
    )


def test_temporal_context_defaults_to_utc_when_timezone_missing() -> None:
    fixed = datetime(2026, 6, 12, 0, 0, tzinfo=ZoneInfo("UTC"))
    section = temporal_context_section(None, now=fixed)

    assert "Timezone: UTC" in section


def test_prepend_temporal_context_places_now_before_system() -> None:
    fixed = datetime(2026, 6, 12, 0, 0, tzinfo=ZoneInfo("UTC"))
    combined = prepend_temporal_context(
        "SYSTEM BODY",
        {"configurable": {"timezone": "UTC"}},
        now=fixed,
    )

    assert combined.startswith("## NOW")
    assert combined.endswith("SYSTEM BODY")


def test_temporal_context_section_standalone() -> None:
    section = temporal_context_section("Asia/Kolkata")
    assert "## NOW" in section
    assert "Asia/Kolkata" in section
