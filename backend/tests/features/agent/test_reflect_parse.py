from __future__ import annotations

import pytest

from features.agent.nodes.reflect import parse_reflection_json


def test_parse_reflection_json_raw_object() -> None:
    result = parse_reflection_json(
        '{"status": "sufficient", "reason": "Totals match goal."}',
    )
    assert result.status == "sufficient"
    assert result.reason == "Totals match goal."


def test_parse_reflection_json_markdown_fence() -> None:
    result = parse_reflection_json(
        '```json\n{"status": "retry", "reason": "empty", "next_sql_hint": "widen dates"}\n```',
    )
    assert result.status == "retry"
    assert result.next_sql_hint == "widen dates"


def test_parse_reflection_json_invalid_raises() -> None:
    with pytest.raises(ValueError):
        parse_reflection_json("not json")
