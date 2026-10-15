import type { TransactionResponse } from '../transactions/schemas';

interface InsightsSummary {
  credit_total: string;
  debit_total: string;
  net: string;
  transaction_count: number;
  fixed_debit_total: string;
  flexible_debit_total: string;
  fixed_credit_total: string;
  flexible_credit_total: string;
}

interface DailyCashflowRow {
  date: string;
  debit_total: string;
  credit_total: string;
  fixed_debit_total: string;
  fixed_credit_total: string;
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
  /** Today in the request timezone (`YYYY-MM-DD`), so pace maths uses the server's day, not the device clock. */
  today: string;
  summary: InsightsSummary;
  daily_cashflow: DailyCashflowRow[];
  /** Flexible spend only: fixed (recurring-category) debits are left out. Shares are of the flexible total. */
  counterparty_spend: CounterpartySpendRow[];
  counterparty_income: CounterpartyIncomeRow[];
  /** Largest flexible debits; fixed (recurring-category) spend is left out. */
  top_expenses: TransactionResponse[];
}
