from __future__ import annotations

from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig

from features.agent.conversation import prior_transcript_before_latest_user
from features.agent.llm import create_agent_llm
from features.agent.prompts import UNDERSTAND_SYSTEM
from features.agent.state import AgentState
from features.agent.timezone_context import prepend_temporal_context, timezone_from_config
from features.agent.time_range import resolve_daily_comparison_range, resolve_time_range

def _latest_user_text(state: AgentState) -> str:
    for msg in reversed(state["messages"]):
        if msg.type == "human":
            content = msg.content
            if isinstance(content, str) and content.strip():
                return content.strip()
    return ""

async def understand_goal(state: AgentState, config: RunnableConfig) -> dict[str, Any]:
    user_text = _latest_user_text(state)
    if not user_text:
        return {"goal": None, "time_range": None, "clarification": None, "error": "No user message to process"}

    system = prepend_temporal_context(UNDERSTAND_SYSTEM, config)

    prior = prior_transcript_before_latest_user(state["messages"])
    user_payload = user_text
    if prior:
        user_payload = f"Prior conversation:\n{prior}\n\nLatest message: {user_text}"

    llm = create_agent_llm()
    response = await llm.ainvoke(
        [
            SystemMessage(content=system),
            HumanMessage(content=user_payload),
        ],
        config=config,
    )

    goal = response.content if isinstance(response.content, str) else str(response.content)
    goal = goal.strip()
    tz = timezone_from_config(config)
    time_range = resolve_time_range(user_text, timezone=tz) or resolve_time_range(
        goal, timezone=tz
    )
    time_range, clarification = resolve_daily_comparison_range(
        user_text=user_text,
        goal=goal,
        time_range=time_range,
        timezone=tz,
    )

    return {
        "goal": goal,
        "time_range": time_range,
        "clarification": clarification,
        "error": None,
    }
