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

_JSON_BLOCK_RE = re.compile(r"```(?:json)?\s*([\s\S]*?)```", re.IGNORECASE)


def _build_reflect_prompt(state: AgentState) -> list[SystemMessage | HumanMessage]:
    payload = {
        "goal": state.get("goal"),
        "query_rounds": state.get("query_rounds", 0),
        "sql_attempts": state.get("sql_attempts", []),
        "last_result": state.get("last_result"),
    }
    return [
        SystemMessage(content=REFLECT_SYSTEM),
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
    response = await llm.ainvoke(_build_reflect_prompt(state), config=config)
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

    return {"reflection": reflection, "error": None}
