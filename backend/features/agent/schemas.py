from __future__ import annotations

from typing import Any, Literal

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

class ChatHistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=8000)

class ChatRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=4000)
    timezone: str | None = Field(
        default=None,
        description="IANA timezone from mobile, e.g. Asia/Kolkata",
    )
    history: list[ChatHistoryMessage] = Field(
        default_factory=list,
        description="Prior user/assistant turns from the client session",
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


class DonutSeriesItem(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    value: float = Field(..., gt=0)


class CashflowPoint(BaseModel):
    date: str = Field(..., min_length=8, max_length=32)
    amount: float = Field(..., ge=0)


class MiniChartPayload(BaseModel):
    title: str | None = Field(default=None, max_length=120)
    series: list[DonutSeriesItem] | None = None
    points: list[CashflowPoint] | None = None


class ChatResponse(BaseModel):
    answer: str = Field(..., min_length=1, max_length=4000)
    blocks: list[dict[str, Any]] = Field(default_factory=list)
    deep_link: dict[str, Any] | None = None


class AgentRespondResult(BaseModel):
    answer: str = Field(..., min_length=1, max_length=4000)
    blocks: list[AgentBlockMiniChart] = Field(default_factory=list, max_length=1)