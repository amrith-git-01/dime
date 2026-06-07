"""Seed ``public.transactions`` with realistic Indian personal-finance patterns.

Simulates a salaried user: monthly bills, weekday food delivery, weekend groceries,
and spending that tracks ``monthly_budget`` / ``daily_budget`` — some months/days
under cap, some over.

Requires ``SUPABASE_URL`` and ``SUPABASE_SECRET_KEY`` in ``backend/.env``.

Usage (from ``backend`` directory)::

    uv run python -m scripts.seed_transactions --replace
    uv run python -m scripts.seed_transactions --replace \\
        --user-id a02925b4-a065-40ee-be3b-f78132de72a1 \\
        --monthly-budget 25000 --daily-budget 900 --months 6

Rows tagged ``note = __SEED__|transactions|v2``. ``--replace`` clears v1 + v2 seed rows.
"""

from __future__ import annotations

import argparse
import calendar
import random
import re
import sys
import uuid
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from typing import Any, Literal

from core.db import create_supabase_service_client

SEED_NOTE = "__SEED__|transactions|v2"
DEFAULT_USER_ID = "a02925b4-a065-40ee-be3b-f78132de72a1"
DEFAULT_MONTHLY_BUDGET = Decimal("25000")
DEFAULT_DAILY_BUDGET = Decimal("900")
IST = timezone(timedelta(hours=5, minutes=30))

DetectedVia = Literal["sms", "notification", "manual", "scan", "voice"]
CounterpartyType = Literal["merchant", "person", "self_transfer", "unknown"]
MonthMode = Literal["under", "on_track", "over"]

_CATEGORY_NAME_TO_BUCKET: dict[str, str] = {
    "Food & Dining": "food",
    "Transport": "transport",
    "Shopping": "shopping",
    "Health": "health",
    "Entertainment": "entertainment",
    "Bills & Utilities": "utilities",
    "Travel": "travel",
    "Education": "education",
    "Income": "income",
    "Other": "other",
}
EXPECTED_SYSTEM_CATEGORY_COUNT = len(_CATEGORY_NAME_TO_BUCKET)

_FOOD_LUNCH = [
    ("Swiggy", Decimal("149"), Decimal("389")),
    ("Zomato", Decimal("165"), Decimal("420")),
    ("EatFit", Decimal("199"), Decimal("350")),
]
_FOOD_DINNER = [
    ("Swiggy", Decimal("249"), Decimal("680")),
    ("Zomato", Decimal("279"), Decimal("750")),
    ("Domino's", Decimal("199"), Decimal("599")),
]
_FOOD_COFFEE = [
    ("Chai Point", Decimal("45"), Decimal("110")),
    ("Starbucks", Decimal("280"), Decimal("520")),
]
_GROCERY = [
    ("BigBasket", Decimal("850"), Decimal("3200")),
    ("Swiggy Instamart", Decimal("299"), Decimal("1800")),
    ("Blinkit", Decimal("199"), Decimal("1500")),
]
_TRANSPORT = [
    ("Uber India", Decimal("95"), Decimal("420")),
    ("Ola", Decimal("85"), Decimal("380")),
    ("Rapido", Decimal("35"), Decimal("120")),
]
_FUEL = ("IndianOil", Decimal("1200"), Decimal("3200"))
_SHOPPING = [
    ("Amazon India", Decimal("499"), Decimal("8999")),
    ("Flipkart", Decimal("599"), Decimal("9999")),
    ("Myntra", Decimal("799"), Decimal("4499")),
]
_ENTERTAINMENT = [
    ("BookMyShow", Decimal("220"), Decimal("900")),
    ("PVR INOX", Decimal("350"), Decimal("1100")),
]
_HEALTH = [
    ("Apollo Pharmacy", Decimal("120"), Decimal("890")),
    ("1mg", Decimal("199"), Decimal("1299")),
]
_PERSON_TRANSFERS = ["Rahul V", "Priya Sharma", "Flatmate UPI", "Mom"]


@dataclass(frozen=True, slots=True)
class BudgetProfile:
    monthly_budget: Decimal
    daily_budget: Decimal


@dataclass(frozen=True, slots=True)
class RecurringBill:
    day_of_month: int
    counterparty_name: str
    amount: Decimal
    bucket: str
    tx_type: Literal["debit", "credit"] = "debit"
    counterparty_type: CounterpartyType = "merchant"
    detected_via: DetectedVia = "notification"
    at_time: time = time(8, 15)


@dataclass(frozen=True, slots=True)
class MonthPlan:
    mode: MonthMode
    debit_target: Decimal


def _normalize_counterparty(raw: str) -> str | None:
    lowered = raw.strip().lower()
    lowered = re.sub(r"[^a-z0-9]+", " ", lowered)
    normalized = re.sub(r"\s+", " ", lowered).strip()
    return normalized or None


def _bucket_for_category_name(name: str) -> str:
    if name in _CATEGORY_NAME_TO_BUCKET:
        return _CATEGORY_NAME_TO_BUCKET[name]
    n = name.lower()
    if any(k in n for k in ("food", "dining", "grocery", "restaurant", "coffee")):
        return "food"
    if "income" in n or "salary" in n:
        return "income"
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
    return "other"


def _money(amount: Decimal) -> Decimal:
    return amount.quantize(Decimal("0.01"))


def _pct_of(monthly_budget: Decimal, ratio: float) -> Decimal:
    return _money(monthly_budget * Decimal(str(ratio)))


def _scaled_monthly_bills(monthly_budget: Decimal) -> list[RecurringBill]:
    """Fixed bills scale with monthly budget (rent, utilities, salary)."""
    return [
        RecurringBill(
            1, "Acme Corp Payroll", _pct_of(monthly_budget, 3.8), "income", "credit",
            "merchant", "notification", time(9, 5),
        ),
        RecurringBill(1, "Cult.fit", _pct_of(monthly_budget, 0.05), "health", at_time=time(6, 30)),
        RecurringBill(
            5, "Landlord Rajesh Kumar", _pct_of(monthly_budget, 0.38), "utilities",
            counterparty_type="person", at_time=time(19, 20),
        ),
        RecurringBill(8, "ACT Fibernet", _pct_of(monthly_budget, 0.035), "utilities"),
        RecurringBill(10, "BESCOM Electricity", _pct_of(monthly_budget, 0.065), "utilities", at_time=time(11, 0)),
        RecurringBill(12, "Netflix", Decimal("649.00"), "entertainment", at_time=time(6, 0)),
        RecurringBill(12, "Spotify", Decimal("119.00"), "entertainment", at_time=time(6, 1)),
        RecurringBill(15, "Jio Prepaid", _pct_of(monthly_budget, 0.025), "utilities"),
        RecurringBill(18, "Airtel Postpaid", _pct_of(monthly_budget, 0.03), "utilities"),
    ]


def _load_categories(client: Any) -> list[dict[str, Any]]:
    res = (
        client.table("categories")
        .select("id,name,icon_name,color,is_system")
        .eq("is_system", True)
        .order("name", desc=False)
        .execute()
    )
    data = res.data
    if not isinstance(data, list):
        return []
    return [r for r in data if isinstance(r, dict) and isinstance(r.get("id"), str)]


def _pick_category_ids(categories: list[dict[str, Any]]) -> dict[str, str]:
    by_name: dict[str, str] = {}
    for row in categories:
        cid = row.get("id")
        name = row.get("name")
        if isinstance(cid, str) and isinstance(name, str):
            by_name[name] = cid

    out: dict[str, str] = {}
    for cat_name, bucket in _CATEGORY_NAME_TO_BUCKET.items():
        cid = by_name.get(cat_name)
        if cid:
            out[bucket] = cid

    for row in categories:
        cid = row.get("id")
        name = row.get("name")
        if not isinstance(cid, str) or not isinstance(name, str):
            continue
        out.setdefault(_bucket_for_category_name(name), cid)

    return out


def _amount_between(rng: random.Random, low: Decimal, high: Decimal) -> Decimal:
    span = int((high - low) * 100)
    if span <= 0:
        return _money(low)
    return _money(low + Decimal(rng.randint(0, span)) / Decimal(100))


def _at(d: date, t: time) -> str:
    return datetime.combine(d, t, tzinfo=IST).isoformat()


def _make_row(
    *,
    user_id: str,
    amount: Decimal,
    tx_type: Literal["debit", "credit"],
    counterparty_name: str,
    category_id: str | None,
    transaction_at: str,
    counterparty_type: CounterpartyType = "merchant",
    detected_via: DetectedVia = "notification",
) -> dict[str, Any]:
    return {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "amount": format(amount, "f"),
        "type": tx_type,
        "counterparty_name": counterparty_name,
        "counterparty_type": counterparty_type,
        "counterparty_normalized": _normalize_counterparty(counterparty_name),
        "category_id": category_id,
        "note": SEED_NOTE,
        "detected_via": detected_via,
        "receipt_url": None,
        "voice_url": None,
        "transaction_at": transaction_at,
    }


def _cat(bucket: str, bucket_map: dict[str, str]) -> str | None:
    return bucket_map.get(bucket) or bucket_map.get("other")


def _pick_month_plan(rng: random.Random, monthly_budget: Decimal) -> MonthPlan:
    mode: MonthMode = rng.choices(
        ["under", "on_track", "over"],
        weights=[32, 43, 25],
        k=1,
    )[0]
    if mode == "under":
        ratio = rng.uniform(0.76, 0.89)
    elif mode == "on_track":
        ratio = rng.uniform(0.90, 0.99)
    else:
        ratio = rng.uniform(1.04, 1.16)
    return MonthPlan(mode=mode, debit_target=_money(monthly_budget * Decimal(str(ratio))))


def _pick_daily_debit_target(
    rng: random.Random,
    daily_budget: Decimal,
    month_plan: MonthPlan,
    month_spent: Decimal,
    days_left: int,
) -> Decimal:
    """Blend typical day shape with month catch-up / slow-down."""
    if month_plan.mode == "over" and rng.random() < 0.28:
        base = daily_budget * Decimal(str(rng.uniform(1.12, 1.38)))
    elif month_plan.mode == "under" and rng.random() < 0.32:
        base = daily_budget * Decimal(str(rng.uniform(0.42, 0.72)))
    elif rng.random() < 0.22:
        base = daily_budget * Decimal(str(rng.uniform(0.55, 0.82)))
    else:
        base = daily_budget * Decimal(str(rng.uniform(0.82, 1.05)))

    if days_left > 0:
        needed = (month_plan.debit_target - month_spent) / Decimal(days_left)
        blended = (base + max(Decimal(0), needed)) / Decimal(2)
        return _money(max(Decimal(0), blended))
    return _money(base)


def _debit_total_on_day(rows: list[dict[str, Any]], d: date) -> Decimal:
    prefix = d.isoformat()
    total = Decimal(0)
    for row in rows:
        if row.get("type") != "debit":
            continue
        ts = str(row.get("transaction_at", ""))
        if ts.startswith(prefix):
            total += Decimal(str(row.get("amount", 0)))
    return total


def _debit_total_in_month(rows: list[dict[str, Any]], year: int, month: int) -> Decimal:
    prefix = f"{year:04d}-{month:02d}"
    total = Decimal(0)
    for row in rows:
        if row.get("type") != "debit":
            continue
        ts = str(row.get("transaction_at", ""))
        if ts.startswith(prefix):
            total += Decimal(str(row.get("amount", 0)))
    return total


def _append_debit(
    rows: list[dict[str, Any]],
    *,
    user_id: str,
    d: date,
    amount: Decimal,
    counterparty_name: str,
    bucket: str,
    bucket_map: dict[str, str],
    hour_range: tuple[int, int],
    rng: random.Random,
    counterparty_type: CounterpartyType = "merchant",
    detected_via: DetectedVia = "notification",
) -> Decimal:
    if amount <= Decimal(0):
        return Decimal(0)
    row = _make_row(
        user_id=user_id,
        amount=amount,
        tx_type="debit",
        counterparty_name=counterparty_name,
        category_id=_cat(bucket, bucket_map),
        transaction_at=_at(d, time(rng.randint(*hour_range), rng.randint(0, 59))),
        counterparty_type=counterparty_type,
        detected_via=detected_via,
    )
    rows.append(row)
    return amount


def _fill_discretionary_day(
    rows: list[dict[str, Any]],
    *,
    user_id: str,
    d: date,
    rng: random.Random,
    bucket_map: dict[str, str],
    target: Decimal,
    already_spent: Decimal,
    fuel_due: bool,
) -> tuple[Decimal, bool]:
    """Add variable debits until daily target is met. Returns (spent, fuel_due)."""
    spent = already_spent
    goal = max(Decimal(0), target)
    attempts = 0

    if fuel_due and spent < goal:
        name, lo, hi = _FUEL
        cap = min(_amount_between(rng, lo, hi), goal - spent + Decimal(200))
        spent += _append_debit(
            rows, user_id=user_id, d=d, amount=cap, counterparty_name=name,
            bucket="transport", bucket_map=bucket_map, hour_range=(7, 9), rng=rng,
            detected_via="sms",
        )
        fuel_due = False

    is_weekend = d.weekday() >= 5
    templates: list[tuple[str, list, tuple[int, int], float]] = [
        ("food", _FOOD_LUNCH if not is_weekend else _GROCERY, (12, 14) if not is_weekend else (10, 13), 0.9 if not is_weekend else 0.75),
        ("food", _FOOD_COFFEE, (8, 10), 0.35),
        ("food", _FOOD_DINNER if is_weekend or d.weekday() == 4 else _FOOD_LUNCH, (19, 22), 0.5 if is_weekend else 0.25),
        ("transport", _TRANSPORT, (8, 22), 0.35),
        ("shopping", _SHOPPING, (11, 21), 0.12),
        ("entertainment", _ENTERTAINMENT, (17, 22), 0.08),
        ("health", _HEALTH, (9, 20), 0.06),
    ]

    while spent < goal * Decimal("0.92") and attempts < 14:
        attempts += 1
        bucket, merchants, hours, prob = rng.choice(templates)
        if rng.random() > prob:
            continue
        name, lo, hi = rng.choice(merchants)
        remaining = goal - spent
        if remaining <= Decimal(30):
            break
        amount = min(_amount_between(rng, lo, hi), remaining + Decimal(50))
        spent += _append_debit(
            rows, user_id=user_id, d=d, amount=amount, counterparty_name=name,
            bucket=bucket, bucket_map=bucket_map, hour_range=hours, rng=rng,
        )

    if spent < goal and rng.random() < 0.5:
        person = rng.choice(_PERSON_TRANSFERS)
        amount = min(_amount_between(rng, Decimal(150), Decimal(1800)), goal - spent + Decimal(100))
        spent += _append_debit(
            rows, user_id=user_id, d=d, amount=amount, counterparty_name=person,
            bucket="other", bucket_map=bucket_map, hour_range=(12, 23), rng=rng,
            counterparty_type="person",
        )

    if spent < goal * Decimal("0.85"):
        name, lo, hi = rng.choice(_SHOPPING)
        top_up = min(_amount_between(rng, lo, hi), goal - spent + Decimal(300))
        spent += _append_debit(
            rows, user_id=user_id, d=d, amount=top_up, counterparty_name=name,
            bucket="shopping", bucket_map=bucket_map, hour_range=(14, 21), rng=rng,
            detected_via=rng.choice(["notification", "manual"]),
        )

    return spent, fuel_due


def _add_recurring_for_day(
    rows: list[dict[str, Any]],
    *,
    user_id: str,
    d: date,
    bills: list[RecurringBill],
    bucket_map: dict[str, str],
) -> None:
    for bill in bills:
        if d.day != min(bill.day_of_month, 28):
            continue
        rows.append(
            _make_row(
                user_id=user_id,
                amount=bill.amount,
                tx_type=bill.tx_type,
                counterparty_name=bill.counterparty_name,
                category_id=_cat(bill.bucket, bucket_map),
                transaction_at=_at(d, bill.at_time),
                counterparty_type=bill.counterparty_type,
                detected_via=bill.detected_via,
            )
        )


def _maybe_add_income_extras(
    rows: list[dict[str, Any]],
    *,
    user_id: str,
    d: date,
    rng: random.Random,
    bucket_map: dict[str, str],
) -> None:
    if rng.random() < 0.02:
        rows.append(
            _make_row(
                user_id=user_id,
                amount=_amount_between(rng, Decimal(15), Decimal(99)),
                tx_type="credit",
                counterparty_name="Google Pay Rewards",
                category_id=_cat("income", bucket_map),
                transaction_at=_at(d, time(rng.randint(9, 18), rng.randint(0, 59))),
            )
        )
    if rng.random() < 0.008:
        rows.append(
            _make_row(
                user_id=user_id,
                amount=_amount_between(rng, Decimal(5000), Decimal(18000)),
                tx_type="credit",
                counterparty_name="Freelance — Razorpay",
                category_id=_cat("income", bucket_map),
                transaction_at=_at(d, time(14, 30)),
            )
        )


def _top_up_month_if_needed(
    rows: list[dict[str, Any]],
    *,
    user_id: str,
    year: int,
    month: int,
    plan: MonthPlan,
    rng: random.Random,
    bucket_map: dict[str, str],
) -> None:
    """If an 'over' month is still under target, add a late-month splurge."""
    if plan.mode != "over":
        return
    spent = _debit_total_in_month(rows, year, month)
    gap = plan.debit_target - spent
    if gap <= Decimal(500):
        return
    last_day = calendar.monthrange(year, month)[1]
    splurge_day = date(year, month, rng.randint(max(1, last_day - 5), last_day))
    name, lo, hi = rng.choice(_SHOPPING)
    amount = min(_amount_between(rng, lo, hi), gap + Decimal(400))
    _append_debit(
        rows,
        user_id=user_id,
        d=splurge_day,
        amount=amount,
        counterparty_name=name,
        bucket="shopping",
        bucket_map=bucket_map,
        hour_range=(15, 21),
        rng=rng,
    )


def _build_rows(
    *,
    rng: random.Random,
    user_id: str,
    start_date: date,
    end_date: date,
    bucket_map: dict[str, str],
    budget: BudgetProfile,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    bills = _scaled_monthly_bills(budget.monthly_budget)

    month_plans: dict[tuple[int, int], MonthPlan] = {}
    cursor = date(start_date.year, start_date.month, 1)
    while cursor <= end_date:
        month_plans[(cursor.year, cursor.month)] = _pick_month_plan(rng, budget.monthly_budget)
        if cursor.month == 12:
            cursor = date(cursor.year + 1, 1, 1)
        else:
            cursor = date(cursor.year, cursor.month + 1, 1)

    fuel_due = False
    days_since_fuel = 0
    d = start_date
    while d <= end_date:
        plan = month_plans[(d.year, d.month)]
        days_in_month = calendar.monthrange(d.year, d.month)[1]
        days_left = max(1, days_in_month - d.day + 1)
        month_spent = _debit_total_in_month(rows, d.year, d.month)

        _add_recurring_for_day(rows, user_id=user_id, d=d, bills=bills, bucket_map=bucket_map)
        fixed_today = _debit_total_on_day(rows, d)

        days_since_fuel += 1
        if days_since_fuel >= 14:
            fuel_due = True
            days_since_fuel = 0

        daily_target = _pick_daily_debit_target(
            rng, budget.daily_budget, plan, month_spent + fixed_today, days_left,
        )
        daily_target = max(daily_target, fixed_today)

        _, fuel_due = _fill_discretionary_day(
            rows,
            user_id=user_id,
            d=d,
            rng=rng,
            bucket_map=bucket_map,
            target=daily_target,
            already_spent=fixed_today,
            fuel_due=fuel_due,
        )
        _maybe_add_income_extras(rows, user_id=user_id, d=d, rng=rng, bucket_map=bucket_map)

        if d.day == days_in_month:
            _top_up_month_if_needed(
                rows,
                user_id=user_id,
                year=d.year,
                month=d.month,
                plan=plan,
                rng=rng,
                bucket_map=bucket_map,
            )

        d += timedelta(days=1)

    rows.sort(key=lambda r: r["transaction_at"])
    return rows


def _upsert_budget(client: Any, user_id: str, budget: BudgetProfile) -> None:
    client.table("budgets").upsert(
        {
            "user_id": user_id,
            "monthly_budget": format(budget.monthly_budget, "f"),
            "daily_budget": format(budget.daily_budget, "f"),
        },
        on_conflict="user_id",
    ).execute()


def _delete_seed_rows(client: Any, user_id: str) -> int:
    removed = 0
    for note_tag in ("__SEED__|transactions|v2", "__SEED__|transactions|v1"):
        res = (
            client.table("transactions")
            .delete()
            .eq("user_id", user_id)
            .eq("note", note_tag)
            .execute()
        )
        data = getattr(res, "data", None)
        if isinstance(data, list):
            removed += len(data)
    return removed


def _insert_batches(client: Any, rows: list[dict[str, Any]], *, batch_size: int = 200) -> None:
    for i in range(0, len(rows), batch_size):
        chunk = rows[i : i + batch_size]
        res = client.table("transactions").insert(chunk).execute()
        if not isinstance(res.data, list):
            msg = f"Insert batch failed at offset {i}: invalid response"
            raise RuntimeError(msg)


def _print_summary(rows: list[dict[str, Any]], budget: BudgetProfile) -> None:
    debits = sum(Decimal(r["amount"]) for r in rows if r["type"] == "debit")
    credits = sum(Decimal(r["amount"]) for r in rows if r["type"] == "credit")
    print(f"  debits:  Rs.{debits:,.2f} ({sum(1 for r in rows if r['type'] == 'debit')} rows)")
    print(f"  credits: Rs.{credits:,.2f} ({sum(1 for r in rows if r['type'] == 'credit')} rows)")
    print(f"  net:     Rs.{(credits - debits):,.2f}")
    print(f"  budget:  monthly Rs.{budget.monthly_budget:,.2f} | daily Rs.{budget.daily_budget:,.2f}")

    by_month: dict[str, Decimal] = {}
    by_day: dict[str, Decimal] = {}
    for row in rows:
        if row.get("type") != "debit":
            continue
        ts = str(row["transaction_at"])
        by_month[ts[:7]] = by_month.get(ts[:7], Decimal(0)) + Decimal(str(row["amount"]))
        by_day[ts[:10]] = by_day.get(ts[:10], Decimal(0)) + Decimal(str(row["amount"]))

    over_months = sum(1 for v in by_month.values() if v > budget.monthly_budget)
    under_months = sum(1 for v in by_month.values() if v < budget.monthly_budget * Decimal("0.9"))
    over_days = sum(1 for v in by_day.values() if v > budget.daily_budget)
    print(
        f"  months:  {len(by_month)} total | {under_months} under ~90% cap | "
        f"{over_months} over monthly cap"
    )
    print(f"  days:    {len(by_day)} total | {over_days} over daily cap")


def _parse_budget_arg(raw: str, label: str) -> Decimal:
    try:
        value = Decimal(raw)
    except Exception as exc:
        raise argparse.ArgumentTypeError(f"{label} must be a number") from exc
    if value < 0:
        raise argparse.ArgumentTypeError(f"{label} must be non-negative")
    return _money(value)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--replace", action="store_true", help="Delete prior seed rows, then insert.")
    parser.add_argument("--user-id", default=DEFAULT_USER_ID, help="Target user UUID.")
    parser.add_argument("--months", type=int, default=6, help="Months of history (default: 6).")
    parser.add_argument("--seed", type=int, default=20260101, help="RNG seed.")
    parser.add_argument(
        "--monthly-budget",
        type=lambda s: _parse_budget_arg(s, "monthly-budget"),
        default=DEFAULT_MONTHLY_BUDGET,
        help=f"Monthly debit cap to simulate (default: {DEFAULT_MONTHLY_BUDGET}).",
    )
    parser.add_argument(
        "--daily-budget",
        type=lambda s: _parse_budget_arg(s, "daily-budget"),
        default=DEFAULT_DAILY_BUDGET,
        help=f"Daily debit cap to simulate (default: {DEFAULT_DAILY_BUDGET}).",
    )
    parser.add_argument(
        "--skip-budget-upsert",
        action="store_true",
        help="Do not write budgets table (transactions only).",
    )
    args = parser.parse_args()

    if args.months < 1 or args.months > 24:
        print("--months must be between 1 and 24.", file=sys.stderr)
        return 1

    budget = BudgetProfile(
        monthly_budget=args.monthly_budget,
        daily_budget=args.daily_budget,
    )
    end_date = date.today()
    start_date = end_date - timedelta(days=args.months * 30)

    client = create_supabase_service_client()
    categories = _load_categories(client)
    if not categories:
        print("No system categories found. Seed aborted.", file=sys.stderr)
        return 1

    bucket_map = _pick_category_ids(categories)
    rng = random.Random(args.seed)
    rows = _build_rows(
        rng=rng,
        user_id=args.user_id,
        start_date=start_date,
        end_date=end_date,
        bucket_map=bucket_map,
        budget=budget,
    )
    print(f"Prepared {len(rows)} transactions from {start_date} through {end_date} (IST).")

    if args.replace:
        removed = _delete_seed_rows(client, args.user_id)
        print(f"--replace: removed {removed} prior seed row(s).")

    if not args.skip_budget_upsert:
        _upsert_budget(client, args.user_id, budget)
        print(
            f"Budget set: monthly Rs.{budget.monthly_budget:,.2f}, "
            f"daily Rs.{budget.daily_budget:,.2f}"
        )

    _insert_batches(client, rows)
    print(f"Inserted {len(rows)} rows for user_id={args.user_id}.")
    print("Summary:")
    _print_summary(rows, budget)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
