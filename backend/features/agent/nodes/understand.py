from __future__ import annotations

from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig

from features.agent.prompts import UNDERSTAND_SYSTEM
from features.agent.state import AgentState
from features.agent.llm import create_agent_llm

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
        return {"goal": None, "error": "No user message to process"}

    llm = create_agent_llm()
    response = await llm.ainvoke([
        SystemMessage(content=UNDERSTAND_SYSTEM),
        HumanMessage(content=user_text),
    ])

    goal = response.content if isinstance(response.content, str) else str(response.content)
    return {"goal": goal.strip(), "error": None}
