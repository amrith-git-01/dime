"""Seed ``public.transactions`` with realistic varied rows for local/dev testing.

Requires ``SUPABASE_URL`` and ``SUPABASE_SECRET_KEY`` (service role) in ``backend/.env``.

Usage (from ``backend`` directory)::

    uv run python -m scripts.seed_transactions
    uv run python -m scripts.seed_transactions --replace   # delete prior seed rows first

Rows are tagged with ``note = __SEED__|transactions|v1`` so ``--replace`` can target them safely.
"""

from __future__ import annotations

import argparse
import random
import re
import sys
import uuid
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from typing import Any

from core.db import create_supabase_service_client

SEED_NOTE = "__SEED__|transactions|v1"
TARGET_USER_ID = "79b5a7e8-5cf8-40da-a46e-1e008e1addb1"
START_DATE = date(2026, 1, 1)
END_DATE = date(2026, 5, 9)

_MERCHANT_BUCKETS: dict[str, list[tuple[str, tuple[Decimal, Decimal]]]] = {
    "food": [
        ("Swiggy", (Decimal("89"), Decimal("620"))),
        ("Zomato", (Decimal("120"), Decimal("780"))),
        ("Chai Point", (Decimal("40"), Decimal("120"))),
        ("McDonald's", (Decimal("150"), Decimal("450"))),
        ("Starbucks", (Decimal("250"), Decimal("520"))),
        ("Domino's", (Decimal("199"), Decimal("699"))),
    ],
    "transport": [
        ("Uber India", (Decimal("120"), Decimal("480"))),
        ("Ola", (Decimal("95"), Decimal("420"))),
        ("Metro recharge", (Decimal("50"), Decimal("500"))),
        ("IndianOil", (Decimal("500"), Decimal("3200"))),
        ("Rapido", (Decimal("45"), Decimal("180"))),
    ],
    "shopping": [
        ("Amazon Pay", (Decimal("199"), Decimal("2499"))),
        ("Flipkart", (Decimal("299"), Decimal("4999"))),
        ("Nykaa", (Decimal("349"), Decimal("1899"))),
        ("Myntra", (Decimal("499"), Decimal("2999"))),
        ("Reliance Digital", (Decimal("999"), Decimal("12999"))),
    ],
    "utilities": [
        ("Airtel", (Decimal("349"), Decimal("899"))),
        ("Jio", (Decimal("239"), Decimal("719"))),
        ("BESCOM", (Decimal("1200"), Decimal("4200"))),
        ("ACT Fibernet", (Decimal("799"), Decimal("1499"))),
    ],
    "entertainment": [
        ("Netflix", (Decimal("649"), Decimal("649"))),
        ("BookMyShow", (Decimal("250"), Decimal("1200"))),
        ("Steam", (Decimal("299"), Decimal("1999"))),
        ("Sony LIV", (Decimal("299"), Decimal("999"))),
    ],
    "health": [
        ("Apollo Pharmacy", (Decimal("120"), Decimal("890"))),
        ("1mg", (Decimal("199"), Decimal("1299"))),
        ("Practo", (Decimal("400"), Decimal("1500"))),
    ],
    "travel": [
        ("IRCTC", (Decimal("450"), Decimal("4200"))),
        ("IndiGo", (Decimal("1800"), Decimal("8900"))),
        ("MakeMyTrip", (Decimal("2500"), Decimal("18500"))),
    ],
    "education": [
        ("Udemy", (Decimal("449"), Decimal("3199"))),
        ("Coursera", (Decimal("2999"), Decimal("4999"))),
    ],
    "income": [
        ("Salary CRED", (Decimal("35000"), Decimal("85000"))),
        ("Freelance payout", (Decimal("5000"), Decimal("25000"))),
    ],
    "other": [
        ("Google Pay", (Decimal("20"), Decimal("500"))),
        ("Cashfree PG", (Decimal("1"), Decimal("49"))),
    ],
}

_SALARY_COUNTERPARTY = "Salary CRED"
_SALARY_AMOUNT = Decimal("48500.00")


def _normalize_counterparty(raw: str) -> str | None:
    lowered = raw.strip().lower()
    lowered = re.sub(r"[^a-z0-9]+", " ", lowered)
    normalized = re.sub(r"\s+", " ", lowered).strip()
    return normalized or None


def _bucket_for_category_name(name: str) -> str:
    n = name.lower()
    if any(k in n for k in ("food", "dining", "grocery", "restaurant", "coffee")):
        return "food"
    if "income" in n or "salary" in n:
        return "income"
    if any(k in n for k in ("flight", "airline", "hotel", "irctc", "booking")):
        return "travel"
    if any(k in n for k in ("transport", "commute", "fuel")):
        return "transport"
    if any(k in n for k in ("shop", "retail", "clothing", "electronics")):
        return "shopping"
    if any(k in n for k in ("util", "bill", "rent", "electric", "internet", "phone")):
        return "utilities"
    if any(k in n for k in ("entertain", "movie", "game", "stream")):
        return "entertainment"
    if any(k in n for k in ("health", "medical", "pharmacy", "fitness")):
        return "health"
    if any(k in n for k in ("education", "course", "book", "learn")):
        return "education"
    return "other"


def _load_categories(client: Any) -> list[dict[str, Any]]:
    res = (
        client.table("categories")
        .select("id,name")
        .order("name", desc=False)
        .execute()
    )
    data = res.data
    if not isinstance(data, list):
        return []
    return [r for r in data if isinstance(r, dict) and isinstance(r.get("id"), str)]


def _pick_category_ids(categories: list[dict[str, Any]]) -> dict[str, str]:
    """Map bucket key -> category id (best effort using DB category names)."""
    out: dict[str, str] = {}
    for row in categories:
        cid = row["id"]
        name = row["name"]
        if not isinstance(cid, str) or not isinstance(name, str):
            continue
        bucket = _bucket_for_category_name(name)
        if bucket not in out:
            out[bucket] = cid
    if not out and categories:
        cid0 = categories[0]["id"]
        if isinstance(cid0, str):
            for b in _MERCHANT_BUCKETS:
                out.setdefault(b, cid0)
    return out


def _random_time(rng: random.Random) -> time:
    return time(
        hour=rng.randint(6, 23),
        minute=rng.randint(0, 59),
        second=rng.randint(0, 59),
    )


def _amount_between(rng: random.Random, low: Decimal, high: Decimal) -> Decimal:
    span = (high - low) * 100
    q = low + (Decimal(rng.randint(0, int(span))) / Decimal(100))
    return q.quantize(Decimal("0.01"))


def _build_rows(
    *,
    rng: random.Random,
    bucket_to_category_id: dict[str, str],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    d = START_DATE
    while d <= END_DATE:
        is_weekend = d.weekday() >= 5
        n = rng.randint(4, 8) if is_weekend else rng.randint(2, 5)
        used_merchants: set[str] = set()

        for i in range(n):
            if d.day == 1 and i == 0:
                rows.append(
                    {
                        "id": str(uuid.uuid4()),
                        "user_id": TARGET_USER_ID,
                        "amount": format(_SALARY_AMOUNT, "f"),
                        "type": "credit",
                        "counterparty_name": _SALARY_COUNTERPARTY,
                        "counterparty_type": "merchant",
                        "counterparty_normalized": _normalize_counterparty(_SALARY_COUNTERPARTY),
                        "category_id": None,
                        "note": SEED_NOTE,
                        "detected_via": "notification",
                        "receipt_url": None,
                        "voice_url": None,
                        "transaction_at": datetime.combine(
                            d, _random_time(rng), tzinfo=timezone.utc
                        ).isoformat(),
                    }
                )
                continue

            if rng.random() < 0.04:
                rows.append(
                    {
                        "id": str(uuid.uuid4()),
                        "user_id": TARGET_USER_ID,
                        "amount": format(
                            _amount_between(rng, Decimal("25"), Decimal("320")), "f"
                        ),
                        "type": "credit",
                        "counterparty_name": "UPI cashback",
                        "counterparty_type": "merchant",
                        "counterparty_normalized": _normalize_counterparty("UPI cashback"),
                        "category_id": None,
                        "note": SEED_NOTE,
                        "detected_via": "notification",
                        "receipt_url": None,
                        "voice_url": None,
                        "transaction_at": datetime.combine(
                            d, _random_time(rng), tzinfo=timezone.utc
                        ).isoformat(),
                    }
                )
                continue

            bucket = rng.choice(list(_MERCHANT_BUCKETS.keys()))
            cat_id = bucket_to_category_id.get(bucket) or next(iter(bucket_to_category_id.values()))
            merchant, (lo, hi) = rng.choice(_MERCHANT_BUCKETS[bucket])
            if merchant in used_merchants:
                merchant = f"{merchant} {i}"
            used_merchants.add(merchant.split()[0])

            detected = rng.choices(
                ["sms", "notification", "manual", "scan"],
                weights=[28, 45, 18, 9],
                k=1,
            )[0]
            cp_type = (
                "person"
                if rng.random() < 0.06 and bucket == "food"
                else "merchant"
            )
            if cp_type == "person":
                merchant = rng.choice(
                    ["Rahul V", "Priya S", "Flatmate UPI", "Family transfer"]
                )

            rows.append(
                {
                    "id": str(uuid.uuid4()),
                    "user_id": TARGET_USER_ID,
                    "amount": format(_amount_between(rng, lo, hi), "f"),
                    "type": "debit",
                    "counterparty_name": merchant,
                    "counterparty_type": cp_type,
                    "counterparty_normalized": _normalize_counterparty(merchant),
                    "category_id": cat_id,
                    "note": SEED_NOTE,
                    "detected_via": detected,
                    "receipt_url": None,
                    "voice_url": None,
                    "transaction_at": datetime.combine(
                        d, _random_time(rng), tzinfo=timezone.utc
                    ).isoformat(),
                }
            )

        d += timedelta(days=1)

    rng.shuffle(rows)
    return rows


def _delete_seed_rows(client: Any) -> int:
    res = (
        client.table("transactions")
        .delete()
        .eq("user_id", TARGET_USER_ID)
        .eq("note", SEED_NOTE)
        .execute()
    )
    data = getattr(res, "data", None)
    if isinstance(data, list):
        return len(data)
    return 0


def _insert_batches(client: Any, rows: list[dict[str, Any]], *, batch_size: int = 200) -> None:
    for i in range(0, len(rows), batch_size):
        chunk = rows[i : i + batch_size]
        res = client.table("transactions").insert(chunk).execute()
        data = res.data
        if not isinstance(data, list):
            msg = f"Insert batch failed at offset {i}: invalid response"
            raise RuntimeError(msg)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--replace",
        action="store_true",
        help=f"Delete existing rows for this user with note={SEED_NOTE!r}, then insert.",
    )
    args = parser.parse_args()

    client = create_supabase_service_client()
    categories = _load_categories(client)
    if not categories:
        print("No categories found in database. Seed aborted.", file=sys.stderr)
        return 1

    bucket_map = _pick_category_ids(categories)
    print(
        "Category bucket -> id:",
        ", ".join(f"{k}={v[:8]}..." for k, v in sorted(bucket_map.items())),
    )

    rng = random.Random(20260101)
    rows = _build_rows(rng=rng, bucket_to_category_id=bucket_map)
    print(f"Prepared {len(rows)} transactions from {START_DATE} through {END_DATE}.")

    if args.replace:
        removed = _delete_seed_rows(client)
        print(f"--replace: removed {removed} prior seed row(s).")

    _insert_batches(client, rows)
    print(f"Inserted {len(rows)} rows for user_id={TARGET_USER_ID}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
