export type AgentThread = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type AgentMessageRole = "user" | "assistant" | "system";

export type AgentMessage = {
  id: string;
  thread_id: string;
  role: AgentMessageRole;
  content: string;
  blocks_json: AgentBlock[] | null;
  deep_link_json: AgentDeepLink | null;
  created_at: string;
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
  chart_kind: "cashflow" | "donut";
  payload: Record<string, unknown>;
};

export type AgentBlockTxPreview = {
  type: "tx_preview";
  rows: Record<string, unknown>[];
  total_count: number;
};

export type AgentBlock =
  | AgentBlockMetric
  | AgentBlockCategoryRow
  | AgentBlockMiniChart
  | AgentBlockTxPreview;

export type AgentDeepLink = {
  screen: string;
  params: Record<string, unknown>;
};

export type AgentChatStatus =
  | { phase: "idle" }
  | { phase: "sql"; round: number }
  | { phase: "reflect"; reason: string }
  | { phase: "responding" }
  | { phase: "error"; message: string };

export type AgentSseEvent =
  | { event: "token"; text: string }
  | { event: "sql_start"; round: number }
  | { event: "sql_end"; round: number; row_count: number; summary: string }
  | {
      event: "reflect";
      status: "sufficient" | "retry" | "give_up";
      reason: string;
    }
  | { event: "block"; block: AgentBlock }
  | { event: "deep_link"; screen: string; params: Record<string, unknown> }
  | { event: "done"; message_id: string }
  | { event: "error"; code: string; message: string };

export type ChatStreamMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  blocks: AgentBlock[];
  deepLink: AgentDeepLink | null;
  isStreaming?: boolean;
};
