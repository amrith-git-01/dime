from __future__ import annotations

import json
import re
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig

from features.agent.llm import create_agent_llm
from features.agent.prompts import REFLECT_SYSTEM
from features.agent.schemas import ReflectionResult
from features.agent.state import AgentState
from features.agent.timezone_context import prepend_temporal_context

_JSON_BLOCK_RE = re.compile(r"```(?:json)?\s*([\s\S]*?)```", re.IGNORECASE)

_BUDGET_HINT = (
    "Join budgets with SUM(debit transactions) for the resolved month using "
    "transaction_at >= time_range.start_iso AND transaction_at <= time_range.end_iso. "
    "Return monthly_budget and spent in one row."
)


def _latest_user_text(state: AgentState) -> str:
    for msg in reversed(state["messages"]):
        if msg.type == "human" and isinstance(msg.content, str):
            return msg.content.strip()
    return ""


def _is_budget_question(state: AgentState) -> bool:
    combined = f"{state.get('goal') or ''} {_latest_user_text(state)}".lower()
    return "budget" in combined


def _last_sql(state: AgentState) -> str:
    attempts = state.get("sql_attempts") or []
    if not attempts:
        return ""
    return str(attempts[-1].get("sql") or "")


def _budget_spend_guard(state: AgentState) -> ReflectionResult | None:
    """Force retry when a budget question was answered without transaction spend."""
    if not _is_budget_question(state):
        return None

    last_result = state.get("last_result") or {}
    if last_result.get("error"):
        return None

    sql = _last_sql(state).lower()
    if "transactions" not in sql:
        return ReflectionResult(
            status="retry",
            reason="Budget check queried budgets only — need current-month debit spend.",
            next_sql_hint=_BUDGET_HINT,
        )

    rows = last_result.get("rows") or []
    if not rows:
        return ReflectionResult(
            status="retry",
            reason="Budget question returned no rows.",
            next_sql_hint=_BUDGET_HINT,
        )

    row = rows[0] if isinstance(rows[0], dict) else {}
    spent_keys = ("spent", "total_spent", "spend", "total", "amount")
    has_spend_column = any(key in row for key in spent_keys)
    if not has_spend_column:
        return ReflectionResult(
            status="retry",
            reason="Budget result missing a spent/total column.",
            next_sql_hint=_BUDGET_HINT,
        )

    return None


def _build_reflect_prompt(
    state: AgentState, config: RunnableConfig
) -> list[SystemMessage | HumanMessage]:
    payload = {
        "goal": state.get("goal"),
        "time_range": state.get("time_range"),
        "query_rounds": state.get("query_rounds", 0),
        "sql_attempts": state.get("sql_attempts", []),
        "last_result": state.get("last_result"),
    }
    return [
        SystemMessage(content=prepend_temporal_context(REFLECT_SYSTEM, config)),
        HumanMessage(content=json.dumps(payload, default=str)),
    ]


def parse_reflection_json(text: str) -> ReflectionResult:
    """Parse reflect node output — DeepSeek does not support json_schema response_format."""
    cleaned = text.strip()
    block = _JSON_BLOCK_RE.search(cleaned)
    if block:
        cleaned = block.group(1).strip()
    elif cleaned.startswith("{"):
        pass
    else:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start >= 0 and end > start:
            cleaned = cleaned[start : end + 1]

    data = json.loads(cleaned)
    return ReflectionResult.model_validate(data)


async def reflect(state: AgentState, config: RunnableConfig) -> dict[str, Any]:
    llm = create_agent_llm()
    response = await llm.ainvoke(_build_reflect_prompt(state, config), config=config)
    raw = response.content
    text = raw if isinstance(raw, str) else str(raw)

    try:
        reflection = parse_reflection_json(text).model_dump()
    except (json.JSONDecodeError, ValueError) as exc:
        msg = f"Could not parse reflection JSON: {exc}"
        reflection = ReflectionResult(
            status="retry",
            reason=msg,
            next_sql_hint="Retry with a simpler SELECT and narrower date range.",
        ).model_dump()

    guard = _budget_spend_guard(state)
    if guard is not None and reflection.get("status") == "sufficient":
        reflection = guard.model_dump()

    return {"reflection": reflection, "error": None}
