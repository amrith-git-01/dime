import type { TransactionRow } from "@/features/transactions/types";

export type InsightsSummary = {
  credit_total: string;
  debit_total: string;
  net: string;
  transaction_count: number;
};

export type DailyCashflowRow = {
  date: string;
  debit_total: string;
  credit_total: string;
};

export type CounterpartySpendRow = {
  payee_key: string;
  display_name: string;
  debit_total: string;
  share: number;
};

export type MonthInsights = {
  year: number;
  month: number;
  summary: InsightsSummary;
  daily_cashflow: DailyCashflowRow[];
  counterparty_spend: CounterpartySpendRow[];
  top_expenses: TransactionRow[];
};
