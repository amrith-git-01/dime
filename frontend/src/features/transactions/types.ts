import type { CounterpartyType } from "./counterpartyTypes";

export type TransactionType = "debit" | "credit";

export type { CounterpartyType };

export type TransactionRow = {
  id: string;
  user_id: string;
  amount: string;
  type: TransactionType;
  counterparty_name: string | null;
  counterparty_type: CounterpartyType;
  counterparty_normalized: string | null;
  merchant: string;
  category: string | null;
  category_id: string | null;
  category_icon_name: string | null;
  category_color: string | null;
  note: string | null;
  detected_via: string | null;
  transaction_at: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  receipt_url: string | null;
  voice_url: string | null;
};

export type TransactionListPage = {
  items: TransactionRow[];
  has_more: boolean;
};

export type MonthSummary = {
  credit_total: string;
  debit_total: string;
  net: string;
  transaction_count: number;
};

export type TopCategoryHome = {
  category_id: string | null;
  name: string;
  icon_name: string | null;
  color: string | null;
  total: string;
};

export type HomeOverview = {
  spent_today: string;
  spent_this_month: string;
  top_categories: TopCategoryHome[];
  recent_transactions: TransactionRow[];
};
