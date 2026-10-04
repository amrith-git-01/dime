from __future__ import annotations

import random
from unittest.mock import MagicMock

import httpx

from features.email.quotes import (
    FALLBACK_QUOTES,
    QuotePage,
    fetch_money_quotes,
    parse_favqs_quotes,
    pick_quote,
)


def test_parse_favqs_quotes_keeps_short_money_rows() -> None:
    payload = {
        "quotes": [
            {"body": "Saving is another form of earning.", "author": "Benjamin Franklin"},
            {"body": "", "author": "Nobody"},
            {"body": "A" * 181, "author": "Long"},
            {"body": "Keep it.", "author": "  "},
            {"body": "Wealth is what you accumulate.", "author": "The Millionaire Next Door"},
        ]
    }
    assert parse_favqs_quotes(payload) == [
        ("Saving is another form of earning.", "Benjamin Franklin"),
        ("Wealth is what you accumulate.", "The Millionaire Next Door"),
    ]


def test_pick_quote_uses_rng() -> None:
    pool = [("one", "A"), ("two", "B")]
    rng = random.Random(0)
    assert pick_quote(pool, rng=rng) in pool


def test_pick_quote_falls_back_when_pool_empty() -> None:
    rng = random.Random(1)
    picked = pick_quote([], rng=rng)
    assert picked in FALLBACK_QUOTES


def test_fetch_money_quotes_without_key_uses_fallback() -> None:
    http_get = MagicMock()
    quotes = fetch_money_quotes(api_key=None, http_get=http_get)
    assert quotes == list(FALLBACK_QUOTES)
    http_get.assert_not_called()


def test_fetch_money_quotes_returns_parsed_page() -> None:
    response = MagicMock()
    response.raise_for_status = MagicMock()
    response.json.return_value = {
        "quotes": [{"body": "Keep it.", "author": "Ada"}]
    }
    http_get = MagicMock(return_value=response)
    quotes = fetch_money_quotes(api_key="secret", http_get=http_get)
    assert quotes == [("Keep it.", "Ada")]
    http_get.assert_called_once()
    kwargs = http_get.call_args.kwargs
    assert kwargs["params"] == {"filter": "money", "type": "tag"}
    assert 'Token token="secret"' in kwargs["headers"]["Authorization"]
    assert kwargs["timeout"] == 2.0


def test_fetch_money_quotes_empty_page_uses_fallback() -> None:
    response = MagicMock()
    response.raise_for_status = MagicMock()
    response.json.return_value = {"quotes": []}
    http_get = MagicMock(return_value=response)
    quotes = fetch_money_quotes(api_key="secret", http_get=http_get)
    assert quotes == list(FALLBACK_QUOTES)


def test_fetch_money_quotes_http_error_uses_fallback() -> None:
    http_get = MagicMock(side_effect=httpx.TimeoutException("boom"))
    quotes = fetch_money_quotes(api_key="secret", http_get=http_get)
    assert quotes == list(FALLBACK_QUOTES)


def test_quote_page_load_fetches_once_then_picks() -> None:
    response = MagicMock()
    response.raise_for_status = MagicMock()
    response.json.return_value = {
        "quotes": [
            {"body": "Keep it.", "author": "Ada"},
            {"body": "Spend less.", "author": "Ben"},
        ]
    }
    http_get = MagicMock(return_value=response)
    page = QuotePage.load("secret", http_get=http_get)
    first = page.pick(rng=random.Random(0))
    second = page.pick(rng=random.Random(1))
    assert first in (("Keep it.", "Ada"), ("Spend less.", "Ben"))
    assert second in (("Keep it.", "Ada"), ("Spend less.", "Ben"))
    http_get.assert_called_once()
