from __future__ import annotations

from features.agent.compare_blocks import (
    build_compare_bar_block,
    build_compare_series,
    enrich_compare_blocks,
)
from features.agent.schemas import AgentBlockMiniChart


def test_build_compare_series_from_category_rows() -> None:
    rows = [
        {
            "category_name": "Food",
            "period_a_amount": 6200.0,
            "period_b_amount": 7800.0,
        },
        {
            "category_name": "Transport",
            "period_a_amount": 3100.0,
            "period_b_amount": 4200.0,
        },
    ]
    series = build_compare_series(rows)
    assert len(series) == 2
    assert series[0].name == "Food"
    assert series[0].period_a == 6200.0
    assert series[0].period_b == 7800.0


def test_build_compare_series_single_totals_row() -> None:
    rows = [{"period_a_total": 18388.35, "period_b_total": 26643.94}]
    series = build_compare_series(rows)
    assert len(series) == 1
    assert series[0].name == "Total spending"
    assert series[0].period_a == 18388.35
    assert series[0].period_b == 26643.94


def test_build_compare_bar_block_uses_time_range_labels() -> None:
    time_range = {
        "kind": "compare",
        "label": "Jun 2026 vs May 2026",
        "period_a": {"label": "Jun 2026"},
        "period_b": {"label": "May 2026"},
    }
    last_result = {
        "rows": [
            {
                "category_name": "Food",
                "period_a_amount": 100.0,
                "period_b_amount": 200.0,
            }
        ]
    }
    block = build_compare_bar_block(time_range=time_range, last_result=last_result)
    assert block is not None
    assert block.chart_kind == "compare_bar"
    assert block.payload["period_a_label"] == "Jun 2026"
    assert block.payload["period_b_label"] == "May 2026"
    assert block.payload["title"] == "Jun 2026 vs May 2026"


def test_enrich_compare_blocks_inserts_when_llm_omits_chart() -> None:
    blocks: list[AgentBlockMiniChart] = []
    time_range = {
        "kind": "compare",
        "label": "Jun 2026 vs May 2026",
        "period_a": {"label": "Jun 2026"},
        "period_b": {"label": "May 2026"},
    }
    last_result = {
        "rows": [{"period_a_total": 100.0, "period_b_total": 200.0}]
    }
    enrich_compare_blocks(blocks, time_range=time_range, last_result=last_result)
    assert len(blocks) == 1
    assert blocks[0].chart_kind == "compare_bar"


def test_enrich_compare_blocks_skips_when_chart_present() -> None:
    existing = AgentBlockMiniChart(
        type="mini_chart",
        chart_kind="compare_bar",
        payload={
            "period_a_label": "A",
            "period_b_label": "B",
            "compare_series": [{"name": "Food", "period_a": 1, "period_b": 2}],
        },
    )
    blocks = [existing]
    enrich_compare_blocks(
        blocks,
        time_range={"kind": "compare"},
        last_result={"rows": [{"period_a_total": 9, "period_b_total": 8}]},
    )
    assert len(blocks) == 1
    assert blocks[0] is existing
