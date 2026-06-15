"""Client-supplied conversation history → LangChain messages and prompt text."""

from __future__ import annotations

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage

from features.agent.schemas import ChatHistoryMessage


def latest_user_text(messages: list[BaseMessage]) -> str:
    """Return the most recent human message text."""
    for msg in reversed(messages):
        if msg.type == "human" and isinstance(msg.content, str) and msg.content.strip():
            return msg.content.strip()
    return ""


def history_to_messages(history: list[ChatHistoryMessage]) -> list[BaseMessage]:
    out: list[BaseMessage] = []
    for item in history:
        if item.role == "user":
            out.append(HumanMessage(content=item.content))
        elif item.role == "assistant":
            out.append(AIMessage(content=item.content))
    return out


def format_conversation_transcript(messages: list[BaseMessage]) -> str:
    """User/assistant turns only — skips in-graph tool messages."""
    lines: list[str] = []
    for msg in messages:
        if msg.type == "human":
            content = msg.content
            if isinstance(content, str) and content.strip():
                lines.append(f"User: {content.strip()}")
        elif msg.type == "ai":
            content = msg.content
            if isinstance(content, str) and content.strip():
                lines.append(f"Assistant: {content.strip()}")
    return "\n".join(lines)
