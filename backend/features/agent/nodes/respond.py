from __future__ import annotations

import json
import logging
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig

from features.agent.compare_blocks import enrich_compare_blocks
from features.agent.deep_link import resolve_deep_link_ids
from features.agent.llm import create_agent_llm
from features.agent.llm_invoke import agent_llm_ainvoke_structured
from features.agent.prompts import RESPOND_SYSTEM
from features.agent.respond_parse import _validate_mini_chart
from features.agent.schemas import (
    AgentBlockMiniChart,
    AgentRespondStructured,
    DeepLinkOutput,
    MiniChartOutput,
)
from features.agent.state import AgentState
from features.agent.time_range import enrich_cashflow_blocks
from features.agent.timezone_context import prepend_temporal_context
from features.agent.trace import (
    elapsed_ms_since,
    log_node_complete,
    log_node_error,
    log_node_start,
    node_timer,
)

logger = logging.getLogger(__name__)
_NODE = "respond"


def _build_respond_prompt(
    state: AgentState, config: RunnableConfig
) -> list[SystemMessage | HumanMessage]:
    from features.agent.conversation import format_conversation_transcript, latest_user_text

    payload: dict[str, Any] = {
        "user_question": latest_user_text(state["messages"]),
        "conversation": format_conversation_transcript(state["messages"]),
        "time_range": state.get("time_range"),
        "last_result": state.get("last_result"),
        "sql_attempts": state.get("sql_attempts", []),
        "error": state.get("error"),
    }
    compare_insights = state.get("compare_insights")
    if compare_insights:
        payload["compare_insights"] = compare_insights
    return [
        SystemMessage(content=prepend_temporal_context(RESPOND_SYSTEM, config)),
        HumanMessage(content=json.dumps(payload, default=str)),
    ]


def _chart_to_block(chart: MiniChartOutput | None) -> AgentBlockMiniChart | None:
    """Convert the structured MiniChartOutput to a validated AgentBlockMiniChart."""
    if chart is None:
        return None

    payload: dict[str, Any] = {}
    if chart.title is not None:
        payload["title"] = chart.title

    if chart.chart_kind == "donut":
        if not chart.series:
            return None
        payload["series"] = [s.model_dump() for s in chart.series[:8]]

    elif chart.chart_kind == "cashflow":
        if not chart.points:
            return None
        payload["points"] = [p.model_dump() for p in chart.points[:30]]

    elif chart.chart_kind == "compare_bar":
        if not chart.compare_series:
            return None
        if chart.period_a_label:
            payload["period_a_label"] = chart.period_a_label
        if chart.period_b_label:
            payload["period_b_label"] = chart.period_b_label
        payload["compare_series"] = [s.model_dump() for s in chart.compare_series[:8]]
    else:
        return None

    block = AgentBlockMiniChart(type="mini_chart", chart_kind=chart.chart_kind, payload=payload)
    return _validate_mini_chart(block)


def _deep_link_to_dict(dl: DeepLinkOutput | None) -> dict[str, Any] | None:
    """Flatten the structured DeepLinkOutput to a dict for resolve_deep_link_ids."""
    if dl is None:
        return None

    params: dict[str, Any] = {
        "filter": dl.filter,
        "year": dl.year,
        "monthIndex0": dl.monthIndex0,
    }
    if dl.filter == "day":
        if dl.dayKey:
            params["dayKey"] = dl.dayKey
    elif dl.filter == "category":
        if dl.categoryId:
            params["categoryId"] = dl.categoryId
        if dl.categoryDisplayName:
            params["categoryDisplayName"] = dl.categoryDisplayName
        if dl.fromIso:
            params["fromIso"] = dl.fromIso
        if dl.toIso:
            params["toIso"] = dl.toIso
    elif dl.filter == "payee":
        if dl.payeeId:
            params["payeeId"] = dl.payeeId
        if dl.payeeDisplayName:
            params["payeeDisplayName"] = dl.payeeDisplayName
        params["payeeKeysTop"] = dl.payeeKeysTop
        if dl.fromIso:
            params["fromIso"] = dl.fromIso
        if dl.toIso:
            params["toIso"] = dl.toIso

    return {"screen": "TransactionsList", "label": dl.label, "params": params}


async def respond(state: AgentState, config: RunnableConfig) -> dict[str, Any]:
    log_node_start(node=_NODE, config=config, state=state)
    start = node_timer()
    try:
        llm = create_agent_llm()
        parsed: AgentRespondStructured = await agent_llm_ainvoke_structured(
            llm,
            AgentRespondStructured,
            _build_respond_prompt(state, config),
            node=_NODE,
            config=config,
        )

        # Convert structured chart to block list
        block = _chart_to_block(parsed.chart)
        blocks: list[AgentBlockMiniChart] = [block] if block is not None else []

        # Enrich cashflow blocks with authoritative date range
        enrich_cashflow_blocks(blocks, state.get("time_range"))

        # compare_insights path: pre-built compare_months block takes precedence
        if state.get("compare_insights"):
            pre_blocks = state.get("ui_blocks") or []
            compare_month_blocks = [b for b in pre_blocks if b.get("type") == "compare_months"]
            final_blocks: list[Any] = compare_month_blocks if compare_month_blocks else [b.model_dump() for b in blocks]
        else:
            # Ensure compare queries always ship a compare_bar
            enrich_compare_blocks(
                blocks,
                time_range=state.get("time_range"),
                last_result=state.get("last_result"),
            )
            final_blocks = [b.model_dump() for b in blocks]

        deep_link = resolve_deep_link_ids(
            _deep_link_to_dict(parsed.deep_link),
            last_result=state.get("last_result"),
            time_range=state.get("time_range"),
        )

        output = {
            "messages": [AIMessage(content=parsed.answer)],
            "ui_blocks": final_blocks,
            "deep_link": deep_link,
            "error": None,
        }
        log_node_complete(
            node=_NODE,
            config=config,
            duration_ms=elapsed_ms_since(start),
            output=output,
        )
        return output

    except Exception as exc:
        log_node_error(
            node=_NODE, config=config, duration_ms=elapsed_ms_since(start), error=str(exc)
        )
        raise
