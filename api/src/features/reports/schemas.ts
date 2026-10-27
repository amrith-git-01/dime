import * as z from 'zod';

/** Shape of the stored snapshot. Bump it when the shape changes: a stored row with an older version is rebuilt. */
export const REPORT_VERSION = 1;

/** A month needs at least this many debits to get a report (and a push). */
export const MIN_REPORT_DEBITS = 5;

/** How many past months the list offers. */
export const REPORT_LIST_MONTHS = 12;

/** `YYYY-MM`, 2000 onwards (the period is a path segment). */
export const periodParamSchema = z.object({ period: z.string().regex(/^20\d{2}-(?:0[1-9]|1[0-2])$/) });

export type ReportSlide = 'cover' | 'damage' | 'lineup' | 'regular' | 'moment' | 'rhythm' | 'win' | 'closing';

export type TitleId = 'one_big_splurge' | 'loyalist' | 'weekend_warrior' | 'payday_sprinter' | 'thousand_cuts' | 'ghost' | 'steady';

/** `id` is null for the "Other" bucket and for "Uncategorized" (told apart by `name`). */
export interface ReportCategory {
  id: string | null;
  name: string;
  icon_name: string | null;
  color: string | null;
  amount: string;
  share: number;
  count: number;
}

export type ReportWin =
  | {
      kind: 'category_down';
      category_id: string;
      category_name: string;
      icon_name: string | null;
      color: string | null;
      amount: string;
      usual: string;
      delta: string;
    }
  | { kind: 'no_spend_streak'; days: number; start: string; end: string }
  | { kind: 'lowest_month'; spent: string; previous_lowest: string; months_compared: number }
  | { kind: 'none' };

export interface ReportTitle {
  id: TitleId;
  evidence: Record<string, string | number>;
}

export interface ReportSnapshot {
  version: number;
  period_key: string;
  year: number;
  month: number;
  timezone: string;
  generated_at: string;
  slides: ReportSlide[];
  debit_count: number;
  spent: string;
  income: string;
  usual_spent: string | null;
  vs_usual: 'same' | 'up' | 'down' | null;
  /** Absolute difference to `usual_spent` (the direction is `vs_usual`). */
  vs_usual_delta: string | null;
  categories: ReportCategory[];
  top_payee: { payee_key: string; display_name: string; count: number; amount: string } | null;
  biggest_spend: { amount: string; display_name: string; category_name: string; date: string } | null;
  busiest_day: { date: string; amount: string; count: number } | null;
  weekday: { totals: string[]; peak_index: number; weekend_share: number };
  no_spend_days: number;
  longest_no_spend_streak: number;
  first_week_share: number;
  win: ReportWin;
  title: ReportTitle;
}

export interface ReportListItem {
  period_key: string;
  year: number;
  month: number;
  debit_count: number;
  viewed: boolean;
}

export interface ReportListResponse {
  items: ReportListItem[];
}
