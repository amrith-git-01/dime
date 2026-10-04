from __future__ import annotations

from datetime import date, datetime, time, timedelta

from features.transactions.time_bounds import month_bounds_iso, parse_tz, previous_month_bounds_iso

IST = "Asia/Kolkata"


def previous_week_bounds_iso(
    tz_name: str = IST,
    *,
    now: datetime | None = None,
) -> tuple[str, str, str]:
    """Previous Mon 00:00 through Sun end, plus ISO week period_key."""
    tz = parse_tz(tz_name)
    ref = (
        now.astimezone(tz)
        if now is not None and now.tzinfo is not None
        else (now.replace(tzinfo=tz) if now is not None else datetime.now(tz))
    )
    this_monday = ref.date() - timedelta(days=ref.weekday())
    prev_monday = this_monday - timedelta(days=7)
    prev_sunday = this_monday - timedelta(days=1)
    start = datetime.combine(prev_monday, time.min, tzinfo=tz)
    end = datetime.combine(prev_sunday, time.max, tzinfo=tz)
    iso_year, iso_week, _ = prev_monday.isocalendar()
    period_key = f"{iso_year}-W{iso_week:02d}"
    return start.isoformat(), end.isoformat(), period_key


def previous_month_period(
    tz_name: str = IST,
    *,
    now: datetime | None = None,
) -> tuple[str, str, str, int, int]:
    """Previous calendar month bounds, period_key YYYY-MM, year, month."""
    tz = parse_tz(tz_name)
    ref = (
        now.astimezone(tz)
        if now is not None and now.tzinfo is not None
        else (now.replace(tzinfo=tz) if now is not None else datetime.now(tz))
    )
    if ref.month == 1:
        year, month = ref.year - 1, 12
    else:
        year, month = ref.year, ref.month - 1
    start, end = month_bounds_iso(year, month, tz_name)
    return start, end, f"{year:04d}-{month:02d}", year, month


def month_containing(day: date) -> tuple[int, int]:
    return day.year, day.month


def previous_month_bounds_for_now(
    tz_name: str = IST,
    *,
    now: datetime | None = None,
) -> tuple[str, str]:
    return previous_month_bounds_iso(tz_name, now=now)
