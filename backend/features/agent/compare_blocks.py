"""Build compare_bar mini charts from SQL rows when the LLM omits them."""

from __future__ import annotations

from typing import Any

from features.agent.schemas import AgentBlockMiniChart, CompareSeriesItem, DonutSeriesItem, MiniChartPayload

_MAX_COMPARE_ROWS = 8

_LABEL_KEYS = (
    "category_name",
    "counterparty_name",
    "name",
    "label",
)

_PERIOD_A_PREFIXES = ("period_a_",)
_PERIOD_B_PREFIXES = ("period_b_",)


def _non_empty_str(value: object) -> str | None:
    if isinstance(value, str):
        stripped = value.strip()
        if stripped:
            return stripped
    return None


def _row_label(row: dict[str, Any], *, fallback: str) -> str:
    for key in _LABEL_KEYS:
        if label := _non_empty_str(row.get(key)):
            return label
    return fallback


def _period_value(row: dict[str, Any], prefixes: tuple[str, ...]) -> float | None:
    for key, raw in row.items():
        key_lower = key.lower()
        if not any(key_lower.startswith(prefix) for prefix in prefixes):
            continue
        if isinstance(raw, (int, float)):
            return float(raw)
    return None


def build_compare_series(
    rows: list[dict[str, Any]],
) -> list[CompareSeriesItem]:
    """Map SQL rows to compare_bar series items."""
    series: list[CompareSeriesItem] = []
    for index, raw in enumerate(rows):
        if not isinstance(raw, dict):
            continue
        period_a = _period_value(raw, _PERIOD_A_PREFIXES)
        period_b = _period_value(raw, _PERIOD_B_PREFIXES)
        if period_a is None or period_b is None:
            continue
        fallback = "Total spending" if len(rows) == 1 else f"Item {index + 1}"
        name = _row_label(raw, fallback=fallback)
        series.append(
            CompareSeriesItem(name=name, period_a=period_a, period_b=period_b)
        )
    return series[:_MAX_COMPARE_ROWS]


def build_compare_bar_block(
    *,
    time_range: dict[str, Any],
    last_result: dict[str, Any] | None,
) -> AgentBlockMiniChart | None:
    """Create a compare_bar block from compare SQL rows + resolved time_range."""
    if time_range.get("kind") != "compare":
        return None

    rows_raw = (last_result or {}).get("rows")
    if not isinstance(rows_raw, list) or not rows_raw:
        return None

    rows = [r for r in rows_raw if isinstance(r, dict)]
    compare_series = build_compare_series(rows)
    if not compare_series:
        return None

    period_a = time_range.get("period_a") if isinstance(time_range.get("period_a"), dict) else {}
    period_b = time_range.get("period_b") if isinstance(time_range.get("period_b"), dict) else {}
    period_a_label = _non_empty_str(period_a.get("label")) or "Period A"
    period_b_label = _non_empty_str(period_b.get("label")) or "Period B"
    title = _non_empty_str(time_range.get("label")) or f"{period_a_label} vs {period_b_label}"

    return AgentBlockMiniChart(
        type="mini_chart",
        chart_kind="compare_bar",
        payload=MiniChartPayload(
            title=title,
            period_a_label=period_a_label,
            period_b_label=period_b_label,
            compare_series=compare_series,
        ).model_dump(exclude_none=True),
    )


_AMOUNT_KEYS = ("amount", "debit_total", "total", "spend", "spending", "sum")


def _row_amount(row: dict[str, Any]) -> float | None:
    for key in _AMOUNT_KEYS:
        raw = row.get(key)
        if isinstance(raw, (int, float)) and raw > 0:
            return float(raw)
    # Fallback: first positive numeric column that isn't a ratio, id, or counter
    for key, val in row.items():
        k = key.lower()
        if isinstance(val, (int, float)) and val > 0:
            if not any(s in k for s in ("id", "count", "pct", "share", "index", "month", "year", "round")):
                return float(val)
    return None


def build_donut_block(
    rows: list[dict[str, Any]],
    *,
    title: str = "Spending breakdown",
) -> AgentBlockMiniChart | None:
    """Build a donut chart from SQL breakdown rows when the LLM skipped it."""
    series: list[DonutSeriesItem] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        label = _row_label(row, fallback="Unknown")
        amount = _row_amount(row)
        if amount is None:
            continue
        series.append(DonutSeriesItem(name=label, value=amount))

    series = sorted(series, key=lambda s: s.value, reverse=True)[:8]
    if len(series) < 2:
        return None

    return AgentBlockMiniChart(
        type="mini_chart",
        chart_kind="donut",
        payload=MiniChartPayload(
            title=title,
            series=series,
        ).model_dump(exclude_none=True),
    )


def enrich_donut_block(
    blocks: list[AgentBlockMiniChart],
    *,
    time_range: dict[str, Any] | None,
    last_result: dict[str, Any] | None,
) -> None:
    """Inject a donut when the LLM returned no chart for a multi-row breakdown query.

    Skips comparison queries (handled by enrich_compare_blocks) and queries
    that already have a chart.
    """
    if blocks:
        return  # LLM already produced a chart
    if time_range and time_range.get("kind") == "compare":
        return  # handled by enrich_compare_blocks

    rows_raw = (last_result or {}).get("rows")
    if not isinstance(rows_raw, list) or len(rows_raw) < 2:
        return

    rows = [r for r in rows_raw if isinstance(r, dict)]

    # Only attempt when rows have a label column — avoid charting single-value aggregates
    has_labels = any(
        isinstance(row.get(k), str) and row.get(k, "").strip()
        for row in rows
        for k in _LABEL_KEYS
    )
    if not has_labels:
        return

    built = build_donut_block(rows)
    if built is not None:
        blocks.append(built)


def enrich_compare_blocks(
    blocks: list[AgentBlockMiniChart],
    *,
    time_range: dict[str, Any] | None,
    last_result: dict[str, Any] | None,
) -> None:
    """
    Ensure compare queries ship a compare_bar chart.

    The respond LLM often returns prose-only for MoM/YoY even when SQL has
    valid period_a / period_b columns — mirror enrich_cashflow_blocks here.
    """
    if not time_range or time_range.get("kind") != "compare":
        return

    if any(block.chart_kind == "compare_bar" for block in blocks):
        return

    built = build_compare_bar_block(time_range=time_range, last_result=last_result)
    if built is None:
        return

    blocks.clear()
    blocks.append(built)
