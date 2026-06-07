from __future__ import annotations

import json
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig

from features.agent.llm import create_agent_llm
from features.agent.prompts import RESPOND_SYSTEM
from features.agent.state import AgentState


def _build_respond_prompt(state: AgentState) -> list[SystemMessage | HumanMessage]:
    user_question = ""
    for msg in reversed(state["messages"]):
        if msg.type == "human" and isinstance(msg.content, str):
            user_question = msg.content
            break

    payload = {
        "user_question": user_question,
        "goal": state.get("goal"),
        "reflection": state.get("reflection"),
        "last_result": state.get("last_result"),
        "sql_attempts": state.get("sql_attempts", []),
        "fatal_error": state.get("error"),
    }
    return [
        SystemMessage(content=RESPOND_SYSTEM),
        HumanMessage(content=json.dumps(payload, default=str)),
    ]


async def respond(state: AgentState, config: RunnableConfig) -> dict[str, Any]:
    llm = create_agent_llm()
    response = await llm.ainvoke(_build_respond_prompt(state), config=config)
    text = response.content if isinstance(response.content, str) else str(response.content)

    return {
        "messages": [response],
        "error": None,
    }