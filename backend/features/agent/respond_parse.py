from __future__ import annotations

import json
import re

from features.agent.deep_link import validate_deep_link
from features.agent.schemas import (
    AgentBlockMiniChart,
    AgentDeepLink,
    AgentRespondJson,
    AgentRespondResult,
    MiniChartPayload,
)
from features.agent.time_range import MAX_DAILY_COMPARISON_DAYS

_JSON_BLOCK_RE = re.compile(r"```(?:json)?\s*([\s\S]*?)```", re.IGNORECASE)

_MAX_DONUT_SLICES = 8


def _extract_json_object(text: str) -> str:
    cleaned = text.strip()
    block = _JSON_BLOCK_RE.search(cleaned)
    if block:
        return block.group(1).strip()
    if cleaned.startswith("{"):
        return cleaned
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start >= 0 and end > start:
        return cleaned[start : end + 1]
    return cleaned


_MAX_COMPARE_ROWS = 8


def _validate_mini_chart(block: AgentBlockMiniChart) -> AgentBlockMiniChart | None:
    try:
        payload = MiniChartPayload.model_validate(block.payload)
    except ValueError:
        return None

    if block.chart_kind == "donut":
        series = payload.series or []
        if not series:
            return None
        return AgentBlockMiniChart(
            type="mini_chart",
            chart_kind="donut",
            payload=MiniChartPayload(
                title=payload.title,
                series=series[:_MAX_DONUT_SLICES],
            ).model_dump(exclude_none=True),
        )

    if block.chart_kind == "compare_bar":
        compare_series = payload.compare_series or []
        if not compare_series:
            return None
        return AgentBlockMiniChart(
            type="mini_chart",
            chart_kind="compare_bar",
            payload=MiniChartPayload(
                title=payload.title,
                period_a_label=payload.period_a_label or "Period A",
                period_b_label=payload.period_b_label or "Period B",
                compare_series=compare_series[:_MAX_COMPARE_ROWS],
            ).model_dump(exclude_none=True),
        )

    # cashflow
    points = payload.points or []
    if not points:
        return None
    return AgentBlockMiniChart(
        type="mini_chart",
        chart_kind="cashflow",
        payload=MiniChartPayload(
            title=payload.title,
            points=points[:MAX_DAILY_COMPARISON_DAYS],
        ).model_dump(exclude_none=True),
    )


def parse_respond_json(text: str) -> AgentRespondResult:
    """Parse respond node output — DeepSeek does not support json_schema response_format."""
    data = json.loads(_extract_json_object(text))
    raw = AgentRespondJson.model_validate(data)

    valid_blocks: list[AgentBlockMiniChart] = []
    for block in raw.blocks:
        if block.type != "mini_chart":
            continue
        validated = _validate_mini_chart(block)
        if validated is not None:
            valid_blocks.append(validated)
            break

    return AgentRespondResult(
        answer=raw.answer.strip(),
        blocks=valid_blocks,
        deep_link=_parse_deep_link(raw.deep_link),
    )


def _parse_deep_link(raw: object) -> AgentDeepLink | None:
    validated = validate_deep_link(raw)
    if validated is None:
        return None
    return AgentDeepLink.model_validate(validated)
