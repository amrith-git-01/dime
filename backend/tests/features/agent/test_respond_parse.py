from __future__ import annotations

import json

import pytest

from features.agent.respond_parse import parse_respond_json


def test_parse_respond_json_donut_block() -> None:
    raw = """
    {
      "answer": "Food led your spending.",
      "blocks": [{
        "type": "mini_chart",
        "chart_kind": "donut",
        "payload": {
          "title": "By category",
          "series": [
            {"name": "Food", "value": 100},
            {"name": "Transport", "value": 50}
          ]
        }
      }]
    }
    """
    result = parse_respond_json(raw)
    assert result.answer == "Food led your spending."
    assert len(result.blocks) == 1
    assert result.blocks[0].chart_kind == "donut"
    assert len(result.blocks[0].payload["series"]) == 2


def test_parse_respond_json_cashflow_block() -> None:
    raw = """{"answer":"Here is the trend.","blocks":[{"type":"mini_chart","chart_kind":"cashflow","payload":{"points":[{"date":"2026-06-01","amount":100}]}}]}"""
    result = parse_respond_json(raw)
    assert result.blocks[0].chart_kind == "cashflow"
    assert result.blocks[0].payload["points"][0]["date"] == "2026-06-01"


def test_parse_respond_json_drops_invalid_chart() -> None:
    raw = """{"answer":"No chart.","blocks":[{"type":"mini_chart","chart_kind":"donut","payload":{"title":"Empty"}}]}"""
    result = parse_respond_json(raw)
    assert result.blocks == []


def test_parse_respond_json_trims_donut_slices() -> None:
    series = [{"name": f"C{i}", "value": float(i + 1)} for i in range(12)]
    raw = json.dumps(
        {
            "answer": "Many",
            "blocks": [
                {
                    "type": "mini_chart",
                    "chart_kind": "donut",
                    "payload": {"series": series},
                }
            ],
        }
    )
    result = parse_respond_json(raw)
    assert len(result.blocks[0].payload["series"]) == 8
