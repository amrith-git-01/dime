import type { TransactionResponse } from '../transactions/schemas';

interface InsightsSummary {
  credit_total: string;
  debit_total: string;
  net: string;
  transaction_count: number;
}

interface DailyCashflowRow {
  date: string;
  debit_total: string;
  credit_total: string;
}

export interface CounterpartySpendRow {
  payee_key: string;
  display_name: string;
  debit_total: string;
  /** 0..1, four decimals. */
  share: number;
  transaction_count: number;
}

export interface CounterpartyIncomeRow {
  payee_key: string;
  display_name: string;
  credit_total: string;
  share: number;
  transaction_count: number;
}

export interface MonthInsightsResponse {
  year: number;
  month: number;
  summary: InsightsSummary;
  daily_cashflow: DailyCashflowRow[];
  counterparty_spend: CounterpartySpendRow[];
  counterparty_income: CounterpartyIncomeRow[];
  top_expenses: TransactionResponse[];
}

export interface MonthlyCashflowRow {
  month: number;
  /** `YYYY-MM-01`. */
  date: string;
  debit_total: string;
  credit_total: string;
}

/** Year-scoped insights: a full calendar year or a year-to-date window. */
export interface YearInsightsResponse {
  year: number;
  is_ytd: boolean;
  summary: InsightsSummary;
  monthly_cashflow: MonthlyCashflowRow[];
  top_payees: CounterpartySpendRow[];
}
