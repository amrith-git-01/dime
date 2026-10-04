from __future__ import annotations

import logging
import random
from collections.abc import Callable, Sequence
from dataclasses import dataclass

import httpx

logger = logging.getLogger(__name__)

Quote = tuple[str, str]
MAX_BODY_LEN = 180
FAVQS_URL = "https://favqs.com/api/quotes"
FAVQS_TIMEOUT = 2.0

FALLBACK_QUOTES: tuple[Quote, ...] = (
    (
        "Beware of little expenses; a small leak will sink a great ship.",
        "Benjamin Franklin",
    ),
    (
        "The cost of a thing is the amount of what I will call life which is required to be exchanged for it.",
        "Henry David Thoreau",
    ),
    (
        "A budget is telling your money where to go instead of wondering where it went.",
        "John C. Maxwell",
    ),
    (
        "Annual income twenty pounds, annual expenditure nineteen nineteen and six, result happiness.",
        "Charles Dickens",
    ),
)

HttpGet = Callable[..., httpx.Response]


def parse_favqs_quotes(payload: object) -> list[Quote]:
    if not isinstance(payload, dict):
        return []
    rows = payload.get("quotes")
    if not isinstance(rows, list):
        return []
    out: list[Quote] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        body = row.get("body")
        author = row.get("author")
        if not isinstance(body, str) or not isinstance(author, str):
            continue
        text = body.strip()
        who = author.strip()
        if not text or not who or len(text) > MAX_BODY_LEN:
            continue
        out.append((text, who))
    return out


def pick_quote(quotes: Sequence[Quote], *, rng: random.Random | None = None) -> Quote:
    pool: Sequence[Quote] = quotes if quotes else FALLBACK_QUOTES
    if rng is not None:
        return rng.choice(list(pool))
    return random.choice(list(pool))


def fetch_money_quotes(
    *,
    api_key: str | None,
    http_get: HttpGet | None = None,
) -> list[Quote]:
    key = api_key.strip() if isinstance(api_key, str) else ""
    if not key:
        return list(FALLBACK_QUOTES)
    getter = http_get or httpx.get
    try:
        response = getter(
            FAVQS_URL,
            params={"filter": "money", "type": "tag"},
            headers={
                "Authorization": f'Token token="{key}"',
                "Accept": "application/json",
            },
            timeout=FAVQS_TIMEOUT,
        )
        response.raise_for_status()
        parsed = parse_favqs_quotes(response.json())
        return parsed or list(FALLBACK_QUOTES)
    except Exception:
        logger.warning("FavQs quote fetch failed; using fallback pool", exc_info=True)
        return list(FALLBACK_QUOTES)


@dataclass(frozen=True)
class QuotePage:
    quotes: tuple[Quote, ...]

    @classmethod
    def load(
        cls,
        api_key: str | None,
        *,
        http_get: HttpGet | None = None,
    ) -> QuotePage:
        return cls(quotes=tuple(fetch_money_quotes(api_key=api_key, http_get=http_get)))

    def pick(self, *, rng: random.Random | None = None) -> Quote:
        return pick_quote(self.quotes, rng=rng)
