/** A transaction as the engine reads it: just the columns it needs, money in integer paise. */
export interface EngineTxRow {
  id: string;
  amount: number;
  type: 'debit' | 'credit';
  transaction_at: string;
  category_id: string | null;
  payee_key: string;
  counterparty_name: string | null;
  counterparty_type: string | null;
  recurring_item_id: string | null;
  /** The category's scope; `spend` for an uncategorized row. */
  scope: string;
  /** 1 when `txn_labels` marks the row one-off (it then stays out of the baselines). */
  one_off: number;
}

/** Days of transactions the engine looks back over (cadences, category months). */
export const LOOKBACK_DAYS = 120;

export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

/** A `payee_patterns` row as the forecast reads it. */
export interface PayeePatternRow {
  payee_key: string;
  display_name: string;
  kind: 'habit' | 'subscription' | 'income' | 'unknown';
  category_id: string | null;
  count_120d: number;
  /** Paise. */
  median_amount: number;
  median_interval_days: number | null;
  interval_cv: number | null;
  last_at: string;
  next_expected_at: string | null;
  alpha: number;
  beta: number;
  suppressed: number;
}
