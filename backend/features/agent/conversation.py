"""Client-supplied conversation history → LangChain messages and prompt text."""

from __future__ import annotations

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage

from features.agent.schemas import ChatHistoryMessage


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


def prior_transcript_before_latest_user(messages: list[BaseMessage]) -> str:
    """Transcript of completed turns, excluding the latest user message."""
    if not messages:
        return ""

    last_human_idx: int | None = None
    for idx in range(len(messages) - 1, -1, -1):
        if messages[idx].type == "human":
            last_human_idx = idx
            break

    if last_human_idx is None:
        return format_conversation_transcript(messages)

    prior = messages[:last_human_idx]
    return format_conversation_transcript(prior)
