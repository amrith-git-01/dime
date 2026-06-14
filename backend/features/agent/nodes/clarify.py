from __future__ import annotations

from typing import Any

from langchain_core.messages import AIMessage
from langchain_core.runnables import RunnableConfig

from features.agent.state import AgentState


async def clarify(state: AgentState, config: RunnableConfig) -> dict[str, Any]:
    """Return a policy clarification without running SQL."""
    del config
    message = (state.get("clarification") or "").strip()
    if not message:
        message = (
            "I need a shorter date range to show a daily chart. Try the last 30 days or less."
        )

    return {
        "messages": [AIMessage(content=message)],
        "ui_blocks": [],
        "error": None,
    }
