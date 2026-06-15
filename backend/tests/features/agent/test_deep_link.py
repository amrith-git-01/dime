from __future__ import annotations

from features.agent.deep_link import validate_deep_link

_PAYEE_LINK = {
    "screen": "TransactionsList",
    "label": "View Swiggy transactions",
    "params": {
        "filter": "payee",
        "year": 2026,
        "monthIndex0": 5,
        "payeeId": "swiggy",
        "payeeDisplayName": "Swiggy",
        "payeeKeysTop": [],
    },
}

_CATEGORY_LINK = {
    "screen": "TransactionsList",
    "label": "View Food transactions",
    "params": {
        "filter": "category",
        "year": 2026,
        "monthIndex0": 5,
        "categoryId": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        "categoryDisplayName": "Food",
    },
}

_DAY_LINK = {
    "screen": "TransactionsList",
    "params": {
        "filter": "day",
        "year": 2026,
        "monthIndex0": 5,
        "dayKey": "2026-06-12",
    },
}


def test_validate_deep_link_payee() -> None:
    result = validate_deep_link(_PAYEE_LINK)
    assert result is not None
    assert result["params"]["filter"] == "payee"
    assert result["params"]["payeeId"] == "swiggy"
    assert result["params"]["payeeKey"] == "swiggy"


def test_validate_deep_link_category() -> None:
    result = validate_deep_link(_CATEGORY_LINK)
    assert result is not None
    assert result["params"]["categoryId"] == "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"


def test_validate_deep_link_day() -> None:
    result = validate_deep_link(_DAY_LINK)
    assert result is not None
    assert result["params"]["dayKey"] == "2026-06-12"


def test_validate_deep_link_rejects_wrong_screen() -> None:
    bad = {**_PAYEE_LINK, "screen": "Home"}
    assert validate_deep_link(bad) is None


def test_validate_deep_link_rejects_invalid_month() -> None:
    bad = {
        **_PAYEE_LINK,
        "params": {**_PAYEE_LINK["params"], "monthIndex0": 12},
    }
    assert validate_deep_link(bad) is None


def test_validate_deep_link_rejects_missing_payee_key() -> None:
    bad = {
        **_PAYEE_LINK,
        "params": {
            "filter": "payee",
            "year": 2026,
            "monthIndex0": 5,
            "payeeDisplayName": "Swiggy",
            "payeeKeysTop": [],
        },
    }
    assert validate_deep_link(bad) is None


def test_validate_deep_link_null() -> None:
    assert validate_deep_link(None) is None


def test_validate_deep_link_payee_with_range() -> None:
    link = {
        "screen": "TransactionsList",
        "params": {
            "filter": "payee",
            "year": 2026,
            "monthIndex0": 5,
            "payeeKey": "uber",
            "payeeDisplayName": "Uber",
            "payeeKeysTop": [],
            "fromIso": "2026-01-01T00:00:00+05:30",
            "toIso": "2026-06-12T23:59:59.999999+05:30",
        },
    }
    result = validate_deep_link(link)
    assert result is not None
    assert result["params"]["fromIso"].startswith("2026-01-01")
