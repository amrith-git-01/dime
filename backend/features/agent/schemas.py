from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

class SqlAttempt(BaseModel):
    sql: str
    row_count: int
    error: str | None = None
    elapsed_ms: int
    round: int

class ReflectionResult(BaseModel):
    status: Literal["sufficient", "retry", "give_up"]
    reason: str
    next_sql_hint: str | None = None

class AgentThreadResponse(BaseModel):
    id: UUID
    title: str
    created_at: datetime
    updated_at: datetime

class AgentMessageResponse(BaseModel):
    id: UUID
    thread_id: UUID
    role: Literal["user", "assistant", "system"]
    content: str
    blocks_json: list[dict[str, Any]] | None = None
    deep_link_json: dict[str, Any] | None = None
    created_at: datetime

class CreateThreadRequest(BaseModel):
    title: str | None = Field(default=None, max_length=120)

class ChatRequest(BaseModel):
    content: str = Field(..., min_length = 1, max_length=4000)
    timezone: str | None = Field(
        default=None,
        description = "IANA timezone from mobile, e.g. Asia/Kolkata"
    )

class AgentBlockMetric(BaseModel):
    type: Literal["metric"] = "metric"
    label: str
    value: str
    delta: str | None = None

class AgentBlockCategoryRow(BaseModel):
    type: Literal["category_row"] = "category_row"
    name: str
    amount: str
    pct: float

class AgentBlockMiniChart(BaseModel):
    type: Literal["mini_chart"] = "mini_chart"
    chart_kind: Literal["cashflow", "donut"]
    payload: dict[str, Any]

class AgentBlockTxPreview(BaseModel):
    type: Literal["tx_preview"] = "tx_preview"
    rows: list[dict[str, Any]]
    total_count: int

AgentBlock = (
    AgentBlockMetric
    | AgentBlockCategoryRow
    | AgentBlockMiniChart
    | AgentBlockTxPreview
)

# SSE events
class SseTokenEvent(BaseModel):
    event: Literal["token"] = "token"
    text: str

class SseSqlStartEvent(BaseModel):
    event: Literal["sql_start"] = "sql_start"
    round: int


class SseSqlEndEvent(BaseModel):
    event: Literal["sql_end"] = "sql_end"
    round: int
    row_count: int
    summary: str


class SseReflectEvent(BaseModel):
    event: Literal["reflect"] = "reflect"
    status: Literal["sufficient", "retry", "give_up"]
    reason: str

class SseBlockEvent(BaseModel):
    event: Literal["block"] = "block"
    block: dict[str, Any]

class SseDeepLinkEvent(BaseModel):
    event: Literal["deep_link"] = "deep_link"
    screen: str
    params: dict[str, Any]

class SseDoneEvent(BaseModel):
    event: Literal["done"] = "done"
    message_id: UUID

class SseErrorEvent(BaseModel):
    event: Literal["error"] = "error"
    code: str
    message: str