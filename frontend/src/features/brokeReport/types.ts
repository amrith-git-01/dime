import type { ReportRoastLevel } from "@/features/settings/types";

export type { ReportRoastLevel };

/**
 * Snapshot v1 of a stored Broke Report, mirroring `api/src/features/reports/schemas.ts`. Money is a
 * decimal string like everywhere else in the API. The snapshot holds facts and ids only: every word
 * the user reads comes from `copy/`, chosen by the roast level.
 */

export const REPORT_SLIDE_IDS = [
  "cover",
  "damage",
  "lineup",
  "regular",
  "moment",
  "rhythm",
  "win",
  "closing",
] as const;

export type ReportSlideId = (typeof REPORT_SLIDE_IDS)[number];

export const REPORT_TITLE_IDS = [
  "one_big_splurge",
  "loyalist",
  "weekend_warrior",
  "payday_sprinter",
  "thousand_cuts",
  "ghost",
  "steady",
] as const;

export type ReportTitleId = (typeof REPORT_TITLE_IDS)[number];

/** `id` is null for the "Other" bucket and for "Uncategorized" (told apart by `name`). */
export type ReportCategory = {
  id: string | null;
  name: string;
  icon_name: string | null;
  color: string | null;
  amount: string;
  share: number;
  count: number;
};

export type ReportWin =
  | {
      kind: "category_down";
      category_id: string;
      category_name: string;
      icon_name: string | null;
      color: string | null;
      amount: string;
      usual: string;
      delta: string;
    }
  | { kind: "no_spend_streak"; days: number; start: string; end: string }
  | {
      kind: "lowest_month";
      spent: string;
      previous_lowest: string;
      months_compared: number;
    }
  | { kind: "none" };

export type ReportSnapshot = {
  version: number;
  period_key: string;
  year: number;
  month: number;
  timezone: string;
  generated_at: string;
  /** The slides the server picked, in order. Ids this build does not know are ignored. */
  slides: string[];
  debit_count: number;
  spent: string;
  income: string;
  usual_spent: string | null;
  vs_usual: "same" | "up" | "down" | null;
  /** Absolute difference to `usual_spent` (the direction is `vs_usual`). */
  vs_usual_delta: string | null;
  categories: ReportCategory[];
  top_payee: {
    payee_key: string;
    display_name: string;
    count: number;
    amount: string;
  } | null;
  biggest_spend: {
    amount: string;
    display_name: string;
    category_name: string;
    date: string;
  } | null;
  busiest_day: { date: string; amount: string; count: number } | null;
  weekday: { totals: string[]; peak_index: number; weekend_share: number };
  no_spend_days: number;
  longest_no_spend_streak: number;
  first_week_share: number;
  win: ReportWin;
  title: {
    id: string;
    evidence: Record<string, string | number>;
  };
};

export type ReportListItem = {
  period_key: string;
  year: number;
  month: number;
  debit_count: number;
  viewed: boolean;
};

/** The period of the bundled preview report (Settings -> Broke Reports -> See a sample). */
export const SAMPLE_PERIOD_KEY = "sample";
