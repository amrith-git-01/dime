import type { TransactionRow } from "@/features/transactions/types";

export type InsightsSummary = {
  credit_total: string;
  debit_total: string;
  net: string;
  transaction_count: number;
  fixed_debit_total?: string;
  flexible_debit_total?: string;
  fixed_credit_total?: string;
  flexible_credit_total?: string;
};

export type DailyCashflowRow = {
  date: string;
  debit_total: string;
  credit_total: string;
  fixed_debit_total?: string;
  fixed_credit_total?: string;
};

export type CounterpartySpendRow = {
  payee_key: string;
  display_name: string;
  debit_total: string;
  share: number;
  transaction_count: number;
};

export type CounterpartyIncomeRow = {
  payee_key: string;
  display_name: string;
  credit_total: string;
  share: number;
  transaction_count: number;
};

export type MonthInsights = {
  year: number;
  month: number;
  /** Today in the request timezone (`YYYY-MM-DD`): the server's day, not the device clock, decides whether a month is past. */
  today?: string;
  summary: InsightsSummary;
  daily_cashflow: DailyCashflowRow[];
  /** Flexible spend only (fixed recurring debits are left out). */
  counterparty_spend: CounterpartySpendRow[];
  counterparty_income: CounterpartyIncomeRow[];
  top_expenses: TransactionRow[];
};
