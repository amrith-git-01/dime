"""Graph node: classify user intent and build comparison time_range when needed.

Runs first on every turn. For comparison queries ("june vs may", "YoY", etc.)
it sets state["time_range"] with the correct subkind so route_after_classify can
dispatch to fetch_compare_data.  For all other queries it returns {} so the
time_range pre-set by service.py (single-period resolver) is preserved.

Uses llm.with_structured_output(ClassifyIntentOutput) so the model is forced to
fill the schema via tool-calling — no regex, no JSON extraction.
"""

from __future__ import annotations

import logging
from datetime import date
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig

from features.agent.conversation import latest_user_text
from features.agent.llm import create_agent_llm
from features.agent.llm_invoke import agent_llm_ainvoke_structured
from features.agent.prompts import CLASSIFY_INTENT_SYSTEM
from features.agent.schemas import ClassifyIntentOutput
from features.agent.state import AgentState
from features.agent.time_range import build_compare_time_range
from features.agent.timezone_context import (
    _local_now,
    prepend_temporal_context,
    timezone_from_config,
)
from features.agent.trace import (
    elapsed_ms_since,
    log_node_complete,
    log_node_error,
    log_node_start,
    node_timer,
)
from features.transactions.time_bounds import parse_tz

logger = logging.getLogger(__name__)
_NODE = "classify_intent"


async def classify_intent(
    state: AgentState, config: RunnableConfig
) -> dict[str, Any]:
    log_node_start(node=_NODE, config=config, state=state)
    start = node_timer()

    tz = timezone_from_config(config) or "Asia/Kolkata"
    user_text = latest_user_text(state["messages"])

    try:
        llm = create_agent_llm()
        system = prepend_temporal_context(CLASSIFY_INTENT_SYSTEM, config)
        prompt = [SystemMessage(content=system), HumanMessage(content=user_text)]

        result: ClassifyIntentOutput = await agent_llm_ainvoke_structured(
            llm,
            ClassifyIntentOutput,
            prompt,
            node=_NODE,
            config=config,
        )

        comparison_kind = result.comparison_kind
        period_a = result.period_a
        period_b = result.period_b

        if not comparison_kind or period_a is None or period_b is None:
            log_node_complete(
                node=_NODE,
                config=config,
                duration_ms=elapsed_ms_since(start),
                output={"comparison_kind": None},
            )
            return {}

        # Convert PeriodInput to the dict shape expected by build_compare_time_range
        pa_dict: dict[str, Any] = {"year": period_a.year}
        pb_dict: dict[str, Any] = {"year": period_b.year}

        if comparison_kind == "month_pair":
            pa_dict["month"] = period_a.month
            pb_dict["month"] = period_b.month
        else:  # year_pair
            pa_dict["ytd"] = bool(period_a.ytd)
            pb_dict["ytd"] = bool(period_b.ytd)

        tz_name, ref = _local_now(tz, None)
        today = ref.astimezone(parse_tz(tz_name)).date()

        time_range = build_compare_time_range(
            comparison_kind,
            pa_dict,
            pb_dict,
            tz_name=tz_name,
            today=today,
        )

        log_node_complete(
            node=_NODE,
            config=config,
            duration_ms=elapsed_ms_since(start),
            output={"comparison_kind": comparison_kind, "label": time_range.get("label")},
        )
        return {"time_range": time_range}

    except Exception as exc:
        log_node_error(
            node=_NODE, config=config, duration_ms=elapsed_ms_since(start), error=str(exc)
        )
        logger.warning("classify_intent failed — falling back to standard routing: %s", exc)
        return {}
