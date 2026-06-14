from __future__ import annotations

from datetime import datetime, time, timedelta

from langchain_core.runnables import RunnableConfig

from features.transactions.time_bounds import (
    current_month_bounds_iso,
    last_n_days_bounds_iso,
    month_bounds_iso,
    parse_tz,
    previous_month_bounds_iso,
)

DEFAULT_TIMEZONE = "UTC"


def timezone_from_config(config: RunnableConfig) -> str | None:
    raw = (config.get("configurable") or {}).get("timezone")
    if isinstance(raw, str) and raw.strip():
        return raw.strip()
    return None


def resolve_timezone(timezone: str | None) -> str:
    if timezone and timezone.strip():
        return timezone.strip()
    return DEFAULT_TIMEZONE


def _local_now(timezone: str | None, now: datetime | None) -> tuple[str, datetime]:
    tz_name = resolve_timezone(timezone)
    tz = parse_tz(tz_name)
    ref = (
        now.astimezone(tz)
        if now is not None and now.tzinfo is not None
        else (now.replace(tzinfo=tz) if now is not None else datetime.now(tz))
    )
    return tz_name, ref


def _format_date_range(start_iso: str, end_iso: str) -> str:
    return f"{start_iso[:10]} → {end_iso[:10]}"


def _today_bounds_from_ref(ref: datetime, tz_name: str) -> tuple[str, str]:
    tz = parse_tz(tz_name)
    local = ref.astimezone(tz)
    day = local.date()
    start = datetime.combine(day, time.min, tzinfo=tz)
    end = datetime.combine(day, time.max, tzinfo=tz)
    return start.isoformat(), end.isoformat()


def _last_n_days_bounds_from_ref(
    n: int,
    ref: datetime,
    tz_name: str,
) -> tuple[str, str]:
    tz = parse_tz(tz_name)
    local = ref.astimezone(tz)
    end_day = local.date()
    start_day = end_day - timedelta(days=n - 1)
    start = datetime.combine(start_day, time.min, tzinfo=tz)
    end = datetime.combine(end_day, time.max, tzinfo=tz)
    return start.isoformat(), end.isoformat()


def temporal_context_section(
    timezone: str | None,
    *,
    now: datetime | None = None,
) -> str:
    """Authoritative NOW block for agent prompts (now-anchoring pattern)."""
    tz_name, ref = _local_now(timezone, now)
    today = ref.date()

    today_start, today_end = _today_bounds_from_ref(ref, tz_name)
    if now is None:
        cur_start, cur_end = current_month_bounds_iso(tz_name)
        week_start, week_end = last_n_days_bounds_iso(7, tz_name)
    else:
        local = ref.astimezone(parse_tz(tz_name))
        cur_start, cur_end = month_bounds_iso(local.year, local.month, tz_name)
        week_start, week_end = _last_n_days_bounds_from_ref(7, ref, tz_name)

    prev_start, prev_end = previous_month_bounds_iso(tz_name, now=ref)
    if now is None:
        month30_start, month30_end = last_n_days_bounds_iso(30, tz_name)
    else:
        month30_start, month30_end = _last_n_days_bounds_from_ref(30, ref, tz_name)

    return f"""## NOW (authoritative — do not guess dates)
Today: {today.isoformat()} ({ref.strftime("%A")})
Timezone: {tz_name}
Today: {_format_date_range(today_start, today_end)}
Current month (this month): {_format_date_range(cur_start, cur_end)}
Previous month: {_format_date_range(prev_start, prev_end)}
Last 7 days: {_format_date_range(week_start, week_end)}
Last 30 days: {_format_date_range(month30_start, month30_end)}

Map relative terms to the ranges above (e.g. "previous month" = Previous month).
Never infer dates from model training knowledge.
"""


def prepend_temporal_context(
    system: str,
    config: RunnableConfig,
    *,
    now: datetime | None = None,
) -> str:
    section = temporal_context_section(timezone_from_config(config), now=now)
    return f"{section}\n{system}"


def timezone_context_section(timezone: str | None) -> str:
    """Deprecated alias — use temporal_context_section."""
    return temporal_context_section(timezone)
