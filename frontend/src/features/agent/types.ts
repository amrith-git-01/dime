export type AgentChatHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AgentBlockMetric = {
  type: "metric";
  label: string;
  value: string;
  delta?: string | null;
};

export type AgentBlockCategoryRow = {
  type: "category_row";
  name: string;
  amount: string;
  pct: number;
};

export type AgentBlockMiniChart = {
  type: "mini_chart";
  chart_kind: "cashflow" | "donut" | "compare_bar";
  payload: {
    title?: string;
    // donut
    series?: { name: string; value: number }[];
    // cashflow
    points?: { date: string; amount: number }[];
    // compare_bar
    period_a_label?: string;
    period_b_label?: string;
    compare_series?: { name: string; period_a: number; period_b: number }[];
  };
};

export type AgentBlockTxPreview = {
  type: "tx_preview";
  rows: Record<string, unknown>[];
  total_count: number;
};

export type CompareMonthCashflowDay = {
  date: string;
  expense: number;
  income: number;
};

export type CompareMonthPayee = {
  name: string;
  amount: number;
  share: number | null;
};

export type CompareMonthPeriodData = {
  spent: number;
  income: number;
  net: number;
  cashflow: CompareMonthCashflowDay[];
  payees: CompareMonthPayee[];
};

export type AgentBlockCompareMonths = {
  type: "compare_months";
  /** Override the cashflow section label. Defaults to "Daily Spend". Set to
   *  "Monthly Spend" for year-pair comparisons. */
  chart_label?: string;
  period_a_label: string;
  period_b_label: string;
  period_a: CompareMonthPeriodData;
  period_b: CompareMonthPeriodData;
};

export type AgentBlock =
  | AgentBlockMetric
  | AgentBlockCategoryRow
  | AgentBlockMiniChart
  | AgentBlockTxPreview
  | AgentBlockCompareMonths;

export type AgentDeepLink = {
  screen: string;
  params: Record<string, unknown>;
  label?: string;
};

/** Failure body (C5): JSON mode answers HTTP 200 with this instead of a `ChatResponse`. */
export type AgentChatErrorBody = {
  error: { code: string; message: string };
};

export type AgentChatResponse = {
  answer: string;
  blocks: AgentBlock[];
  deep_link: AgentDeepLink | null;
  /** Signed conversation memory; echo it back unchanged on the next turn. */
  memory?: string | null;
  /** Identifies this turn for `POST /agent/feedback`. */
  turn_id?: string | null;
};

export type AgentStepEvent = { tool: string; label: string };

export type AgentFeedbackRating = "up" | "down";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  blocks: AgentBlock[];
  deepLink: AgentDeepLink | null;
  /** True while waiting for the server response. */
  isPending?: boolean;
  /** True when `content` is an error message; never sent back to the API as history. */
  isError?: boolean;
  /** Latest real progress label from a `step` event, shown until answer text arrives. */
  stepLabel?: string | null;
  /** Server turn id of a completed assistant message (enables feedback). */
  turnId?: string | null;
  /** The user's vote on this message; one vote per message. */
  feedback?: AgentFeedbackRating | null;
};
