"""Calendar bounds in a named timezone as ISO strings for PostgREST filters.

Requires the ``tzdata`` package on Windows (see project dependencies) so
``zoneinfo.ZoneInfo`` can resolve IANA names such as ``Asia/Kolkata``.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo


def parse_tz(name: str) -> ZoneInfo:
    stripped = name.strip()
    if not stripped:
        msg = "Timezone is required"
        raise ValueError(msg)
    try:
        return ZoneInfo(stripped)
    except Exception as exc:
        msg = f"Invalid timezone: {name!r}"
        raise ValueError(msg) from exc


def month_bounds_iso(year: int, month: int, tz_name: str) -> tuple[str, str]:
    tz = parse_tz(tz_name)
    start = datetime.combine(date(year, month, 1), time.min, tzinfo=tz)
    if month == 12:
        next_start = datetime.combine(date(year + 1, 1, 1), time.min, tzinfo=tz)
    else:
        next_start = datetime.combine(date(year, month + 1, 1), time.min, tzinfo=tz)
    end = next_start - timedelta(microseconds=1)
    return start.isoformat(), end.isoformat()


def today_bounds_iso(tz_name: str) -> tuple[str, str]:
    tz = parse_tz(tz_name)
    now = datetime.now(tz)
    day = now.date()
    start = datetime.combine(day, time.min, tzinfo=tz)
    end = datetime.combine(day, time.max, tzinfo=tz)
    return start.isoformat(), end.isoformat()


def current_month_bounds_iso(tz_name: str) -> tuple[str, str]:
    tz = parse_tz(tz_name)
    now = datetime.now(tz)
    return month_bounds_iso(now.year, now.month, tz_name)
