from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

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
    chart_kind: Literal["cashflow", "donut", "compare_bar"]
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


class CompareSeriesItem(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    period_a: float = Field(..., ge=0)
    period_b: float = Field(..., ge=0)


class MiniChartPayload(BaseModel):
    title: str | None = Field(default=None, max_length=120)
    # donut
    series: list[DonutSeriesItem] | None = None
    # cashflow
    points: list[CashflowPoint] | None = None
    # compare_bar
    period_a_label: str | None = Field(default=None, max_length=80)
    period_b_label: str | None = Field(default=None, max_length=80)
    compare_series: list[CompareSeriesItem] | None = None


class AgentDeepLinkDayParams(BaseModel):
    filter: Literal["day"] = "day"
    year: int = Field(..., ge=2000, le=2100)
    monthIndex0: int = Field(..., ge=0, le=11)
    dayKey: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")


class AgentDeepLinkCategoryParams(BaseModel):
    filter: Literal["category"] = "category"
    year: int = Field(..., ge=2000, le=2100)
    monthIndex0: int = Field(..., ge=0, le=11)
    categoryId: str = Field(..., min_length=36, max_length=36)
    categoryDisplayName: str = Field(..., min_length=1, max_length=120)
    fromIso: str | None = Field(default=None, min_length=10, max_length=64)
    toIso: str | None = Field(default=None, min_length=10, max_length=64)

    @model_validator(mode="after")
    def range_iso_pair(self) -> AgentDeepLinkCategoryParams:
        if (self.fromIso is None) != (self.toIso is None):
            msg = "fromIso and toIso must both be set or both omitted"
            raise ValueError(msg)
        return self


class AgentDeepLinkPayeeParams(BaseModel):
    filter: Literal["payee"] = "payee"
    year: int = Field(..., ge=2000, le=2100)
    monthIndex0: int = Field(..., ge=0, le=11)
    payeeId: str | None = Field(default=None, min_length=1, max_length=120)
    payeeKey: str | None = Field(default=None, min_length=1, max_length=120)
    payeeDisplayName: str = Field(..., min_length=1, max_length=120)
    payeeKeysTop: list[str] = Field(default_factory=list, max_length=20)
    fromIso: str | None = Field(default=None, min_length=10, max_length=64)
    toIso: str | None = Field(default=None, min_length=10, max_length=64)

    @model_validator(mode="after")
    def require_payee_id(self) -> AgentDeepLinkPayeeParams:
        resolved = (self.payeeId or self.payeeKey or "").strip()
        if not resolved:
            msg = "payeeId is required"
            raise ValueError(msg)
        self.payeeId = resolved
        self.payeeKey = resolved
        return self

    @model_validator(mode="after")
    def range_iso_pair(self) -> AgentDeepLinkPayeeParams:
        if (self.fromIso is None) != (self.toIso is None):
            msg = "fromIso and toIso must both be set or both omitted"
            raise ValueError(msg)
        return self


AgentDeepLinkParams = (
    AgentDeepLinkDayParams
    | AgentDeepLinkCategoryParams
    | AgentDeepLinkPayeeParams
)


class AgentDeepLink(BaseModel):
    screen: Literal["TransactionsList"] = "TransactionsList"
    label: str | None = Field(default=None, max_length=120)
    params: AgentDeepLinkDayParams | AgentDeepLinkCategoryParams | AgentDeepLinkPayeeParams = Field(
        discriminator="filter"
    )


class ChatResponse(BaseModel):
    answer: str = Field(..., min_length=1, max_length=4000)
    blocks: list[dict[str, Any]] = Field(default_factory=list)
    deep_link: dict[str, Any] | None = None


class AgentRespondResult(BaseModel):
    answer: str = Field(..., min_length=1, max_length=4000)
    blocks: list[AgentBlockMiniChart] = Field(default_factory=list, max_length=1)
    deep_link: AgentDeepLink | None = None


class AgentRespondJson(BaseModel):
    """Loose parse of LLM respond JSON before chart/deep_link validation."""

    answer: str = Field(..., min_length=1, max_length=4000)
    blocks: list[AgentBlockMiniChart] = Field(default_factory=list, max_length=1)
    deep_link: dict[str, Any] | None = None


# ---------------------------------------------------------------------------
# Structured output schemas — used with llm.with_structured_output()
# ---------------------------------------------------------------------------


class MiniChartOutput(BaseModel):
    """Flat chart schema for with_structured_output — no open dict payload.

    chart_kind determines which fields are relevant:
    - donut       → series
    - cashflow    → points
    - compare_bar → period_a_label, period_b_label, compare_series
    """

    chart_kind: Literal["cashflow", "donut", "compare_bar"] = Field(
        description="Type of chart to render"
    )
    title: str | None = Field(default=None, description="Optional chart title")
    series: list[DonutSeriesItem] | None = Field(
        default=None, description="Donut slices — required when chart_kind=donut, else null. Max 8 items, all values > 0."
    )
    points: list[CashflowPoint] | None = Field(
        default=None, description="Daily cashflow points — required when chart_kind=cashflow, else null. Max 30 items."
    )
    period_a_label: str | None = Field(
        default=None, description="Primary period label — required when chart_kind=compare_bar, else null."
    )
    period_b_label: str | None = Field(
        default=None, description="Baseline period label — required when chart_kind=compare_bar, else null."
    )
    compare_series: list[CompareSeriesItem] | None = Field(
        default=None, description="Bar series — required when chart_kind=compare_bar, else null. Max 8 items."
    )


class DeepLinkOutput(BaseModel):
    """Flat deep link schema for with_structured_output.

    filter determines which params are required:
    - day      → dayKey
    - category → categoryId, categoryDisplayName
    - payee    → payeeId, payeeDisplayName
    Multi-month ranges (payee & category only): also fill fromIso + toIso.
    """

    filter: Literal["day", "category", "payee"] = Field(
        description="Navigation target type"
    )
    label: str | None = Field(default=None, description="Button label shown to user")
    year: int = Field(description="Calendar year for navigation")
    monthIndex0: int = Field(ge=0, le=11, description="0-based month index (Jan=0)")
    dayKey: str | None = Field(
        default=None, description="YYYY-MM-DD — required when filter=day, else null"
    )
    categoryId: str | None = Field(
        default=None, description="UUID copied EXACTLY from SQL category_id — required when filter=category, else null"
    )
    categoryDisplayName: str | None = Field(
        default=None, description="Category display name — required when filter=category, else null"
    )
    payeeId: str | None = Field(
        default=None, description="Exact counterparty_normalized from SQL — required when filter=payee, else null"
    )
    payeeDisplayName: str | None = Field(
        default=None, description="Payee display name — required when filter=payee, else null"
    )
    payeeKeysTop: list[str] = Field(
        default_factory=list, description="Additional payee key aliases"
    )
    fromIso: str | None = Field(
        default=None, description="Range start ISO (multi-month payee/category only)"
    )
    toIso: str | None = Field(
        default=None, description="Range end ISO (multi-month payee/category only)"
    )


class AgentRespondStructured(BaseModel):
    """Structured response bound via llm.with_structured_output().

    DeepSeek's tool-calling path enforces this schema at the API level —
    the model cannot omit or misformat any field.
    """

    answer: str = Field(
        description=(
            "Response text in 1–6 sentences. "
            "With chart: 1–2 sentences, headline insight only. "
            "No chart: 2–5 sentences, lead with key number. "
            "Use ₹ Indian-style (₹12,400). Bold at most one key number per sentence with **bold**. "
            "Never mention SQL, tools, or internal steps."
        )
    )
    chart: MiniChartOutput | None = Field(
        default=None,
        description=(
            "Fill with ONE chart when applicable, else null. "
            "MANDATORY rules: "
            "(1) compare_insights in payload → null (compare_months card is auto-injected). "
            "(2) time_range.kind=compare → compare_bar using period_a_*/period_b_* columns. "
            "(3) 2+ rows with name/label column AND positive amount → donut. "
            "(4) Rows with date column AND positive amount → cashflow. "
            "(5) Single total, budget, 0 rows → null."
        ),
    )
    deep_link: DeepLinkOutput | None = Field(
        default=None,
        description=(
            "Fill when SQL result contains exactly ONE distinct payee (counterparty_normalized) "
            "or ONE category (category_id), or user asked for a specific day. "
            "Null for breakdowns with multiple entities, comparisons, budgets, or empty results. "
            "NEVER invent IDs — copy exact values from last_result.rows."
        ),
    )


# ---------------------------------------------------------------------------
# Intent classifier structured output
# ---------------------------------------------------------------------------


class PeriodInput(BaseModel):
    """Describes one side of a comparison period extracted from the user query."""

    year: int = Field(description="Calendar year (e.g. 2026)")
    month: int | None = Field(
        default=None, description="Month 1–12 — set only for month_pair, else null"
    )
    ytd: bool | None = Field(
        default=None,
        description="True = year-to-date, False = full calendar year — set only for year_pair, else null",
    )


class ClassifyIntentOutput(BaseModel):
    """Intent classification result — routes comparison vs standard queries."""

    comparison_kind: Literal["month_pair", "year_pair"] | None = Field(
        default=None,
        description=(
            "'month_pair' or 'year_pair' ONLY when the user explicitly compares TWO DIFFERENT TIME PERIODS. "
            "null for everything else — category comparisons ('food vs transport'), payee comparisons "
            "('swiggy vs zomato'), single-period queries, budgets, and daily queries."
        ),
    )
    period_a: PeriodInput | None = Field(
        default=None,
        description="Primary / newer period — null when comparison_kind is null",
    )
    period_b: PeriodInput | None = Field(
        default=None,
        description="Baseline / older period — null when comparison_kind is null",
    )