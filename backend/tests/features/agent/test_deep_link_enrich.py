from __future__ import annotations

from features.agent.deep_link import enrich_deep_link, validate_deep_link

_PAYEE_LINK = {
    "screen": "TransactionsList",
    "label": "View Uber transactions",
    "params": {
        "filter": "payee",
        "year": 2026,
        "monthIndex0": 5,
        "payeeKey": "uber",
        "payeeDisplayName": "Uber",
        "payeeKeysTop": [],
    },
}

_YEAR_RANGE = {
    "kind": "calendar_year",
    "start_date": "2026-01-01",
    "end_date": "2026-06-12",
    "start_iso": "2026-01-01T00:00:00+05:30",
    "end_iso": "2026-06-12T23:59:59.999999+05:30",
}


def test_enrich_deep_link_adds_range_for_calendar_year() -> None:
    result = enrich_deep_link(_PAYEE_LINK, _YEAR_RANGE)
    assert result is not None
    assert result["params"]["fromIso"] == _YEAR_RANGE["start_iso"]
    assert result["params"]["toIso"] == _YEAR_RANGE["end_iso"]
    assert result["params"]["monthIndex0"] == 5


def test_enrich_deep_link_single_month_unchanged() -> None:
    may_range = {
        "kind": "previous_month",
        "start_date": "2026-05-01",
        "end_date": "2026-05-31",
        "start_iso": "2026-05-01T00:00:00+05:30",
        "end_iso": "2026-05-31T23:59:59.999999+05:30",
    }
    result = enrich_deep_link(_PAYEE_LINK, may_range)
    assert result is not None
    assert "fromIso" not in result["params"]


def test_enrich_deep_link_day_filter_unchanged() -> None:
    day_link = validate_deep_link(
        {
            "screen": "TransactionsList",
            "params": {
                "filter": "day",
                "year": 2026,
                "monthIndex0": 5,
                "dayKey": "2026-06-12",
            },
        }
    )
    result = enrich_deep_link(day_link, _YEAR_RANGE)
    assert result is not None
    assert result["params"]["filter"] == "day"
    assert "fromIso" not in result["params"]
