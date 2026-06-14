from __future__ import annotations

import json
import re

from features.agent.schemas import (
    AgentBlockMiniChart,
    AgentRespondResult,
    CashflowPoint,
    DonutSeriesItem,
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


def _validate_mini_chart(block: AgentBlockMiniChart) -> AgentBlockMiniChart | None:
    try:
        payload = MiniChartPayload.model_validate(block.payload)
    except ValueError:
        return None

    if block.chart_kind == "donut":
        series = payload.series or []
        if not series:
            return None
        trimmed = series[:_MAX_DONUT_SLICES]
        return AgentBlockMiniChart(
            type="mini_chart",
            chart_kind="donut",
            payload=MiniChartPayload(
                title=payload.title,
                series=trimmed,
            ).model_dump(),
        )

    points = payload.points or []
    if not points:
        return None
    trimmed = points[:MAX_DAILY_COMPARISON_DAYS]
    return AgentBlockMiniChart(
        type="mini_chart",
        chart_kind="cashflow",
        payload=MiniChartPayload(
            title=payload.title,
            points=trimmed,
        ).model_dump(),
    )


def parse_respond_json(text: str) -> AgentRespondResult:
    """Parse respond node output — DeepSeek does not support json_schema response_format."""
    data = json.loads(_extract_json_object(text))
    raw = AgentRespondResult.model_validate(data)

    valid_blocks: list[AgentBlockMiniChart] = []
    for block in raw.blocks:
        if block.type != "mini_chart":
            continue
        validated = _validate_mini_chart(block)
        if validated is not None:
            valid_blocks.append(validated)
            break

    return AgentRespondResult(answer=raw.answer.strip(), blocks=valid_blocks)
