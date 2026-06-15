from __future__ import annotations

from features.agent.deep_link import resolve_deep_link_ids
from features.agent.sql_entities import extract_sql_entities

_UBER_RESULT = {
    "rows": [
        {
            "counterparty_normalized": "uber india",
            "counterparty_name": "Uber India",
            "total_spending": 1955.14,
        }
    ],
    "row_count": 1,
}

_LLM_PAYEE_LINK = {
    "screen": "TransactionsList",
    "label": "View Uber transactions",
    "params": {
        "filter": "payee",
        "year": 2026,
        "monthIndex0": 5,
        "payeeId": "uber",
        "payeeDisplayName": "Uber",
        "payeeKeysTop": [],
    },
}

_YEAR_RANGE = {
    "kind": "calendar_year",
    "start_date": "2026-01-01",
    "end_date": "2026-06-14",
    "start_iso": "2026-01-01T00:00:00+05:30",
    "end_iso": "2026-06-14T23:59:59.999999+05:30",
}


def test_extract_sql_entities_payee() -> None:
    entities = extract_sql_entities(_UBER_RESULT)
    assert len(entities.payees) == 1
    assert entities.payees[0].payee_id == "uber india"
    assert entities.payees[0].display_name == "Uber India"


def test_resolve_deep_link_overwrites_wrong_payee_id() -> None:
    result = resolve_deep_link_ids(
        _LLM_PAYEE_LINK,
        last_result=_UBER_RESULT,
        time_range=_YEAR_RANGE,
    )
    assert result is not None
    assert result["params"]["payeeId"] == "uber india"
    assert result["params"]["payeeKey"] == "uber india"
    assert result["params"]["payeeDisplayName"] == "Uber India"
    assert result["params"]["fromIso"] == _YEAR_RANGE["start_iso"]


def test_resolve_deep_link_drops_payee_without_sql_id() -> None:
    aggregate_only = {
        "rows": [{"total_spending": 1955.14}],
        "row_count": 1,
    }
    result = resolve_deep_link_ids(
        _LLM_PAYEE_LINK,
        last_result=aggregate_only,
        time_range=_YEAR_RANGE,
    )
    assert result is None


def test_resolve_deep_link_category_id() -> None:
    link = {
        "screen": "TransactionsList",
        "params": {
            "filter": "category",
            "year": 2026,
            "monthIndex0": 5,
            "categoryId": "11111111-1111-1111-1111-111111111111",
            "categoryDisplayName": "Food",
        },
    }
    last_result = {
        "rows": [
            {
                "category_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
                "category_name": "Food & Dining",
                "total": 8240,
            }
        ],
    }
    result = resolve_deep_link_ids(link, last_result=last_result, time_range=None)
    assert result is not None
    assert result["params"]["categoryId"] == "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    assert result["params"]["categoryDisplayName"] == "Food & Dining"
