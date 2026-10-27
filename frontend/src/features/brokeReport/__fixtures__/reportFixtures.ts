import type { ReportSnapshot } from "../types";

/**
 * A complete month: every slide, every field. Names are made up on purpose (this is also what the
 * "See a sample" preview shows every user, so it must not name a real shop or app).
 */
export const FULL_SNAPSHOT: ReportSnapshot = {
  version: 1,
  period_key: "2026-10",
  year: 2026,
  month: 10,
  timezone: "Asia/Kolkata",
  generated_at: "2026-11-01T02:35:00.000Z",
  slides: ["cover", "damage", "lineup", "regular", "moment", "rhythm", "win", "closing"],
  debit_count: 41,
  spent: "18620.00",
  income: "52000.00",
  usual_spent: "19900.00",
  vs_usual: "down",
  vs_usual_delta: "1280.00",
  categories: [
    { id: "cat-food", name: "Food & Dining", icon_name: "utensils-crossed", color: null, amount: "7450.00", share: 0.4, count: 17 },
    { id: "cat-transport", name: "Transport", icon_name: "bus", color: null, amount: "3350.00", share: 0.18, count: 9 },
    { id: "cat-shopping", name: "Shopping", icon_name: "shopping-bag", color: null, amount: "2980.00", share: 0.16, count: 4 },
    { id: null, name: "Other", icon_name: null, color: null, amount: "4840.00", share: 0.26, count: 11 },
  ],
  top_payee: { payee_key: "corner cafe", display_name: "Corner Cafe", count: 9, amount: "2150.00" },
  biggest_spend: { amount: "4200.00", display_name: "City Mall", category_name: "Shopping", date: "2026-10-11" },
  busiest_day: { date: "2026-10-18", amount: "3100.00", count: 5 },
  weekday: {
    totals: ["1800.00", "1500.00", "2100.00", "2400.00", "5200.00", "3800.00", "1820.00"],
    peak_index: 4,
    weekend_share: 0.302,
  },
  no_spend_days: 9,
  longest_no_spend_streak: 3,
  first_week_share: 0.38,
  win: {
    kind: "category_down",
    category_id: "cat-food",
    category_name: "Food & Dining",
    icon_name: "utensils-crossed",
    color: null,
    amount: "7450.00",
    usual: "9100.00",
    delta: "1650.00",
  },
  title: { id: "thousand_cuts", evidence: { debit_count: 41, median_debit: "320.00" } },
};

/** The bundled preview (`periodKey: 'sample'`): the full month under a fixed, past period. */
export const SAMPLE_SNAPSHOT: ReportSnapshot = {
  ...FULL_SNAPSHOT,
  period_key: "2026-09",
  year: 2026,
  month: 9,
  generated_at: "2026-10-01T02:35:00.000Z",
};

/** The smallest eligible month: five debits, one category, nothing notable. */
export const MINIMAL_SNAPSHOT: ReportSnapshot = {
  version: 1,
  period_key: "2026-08",
  year: 2026,
  month: 8,
  timezone: "Asia/Kolkata",
  generated_at: "2026-09-01T02:35:00.000Z",
  slides: ["cover", "damage", "lineup", "closing"],
  debit_count: 5,
  spent: "1240.00",
  income: "0.00",
  usual_spent: null,
  vs_usual: null,
  vs_usual_delta: null,
  categories: [
    { id: "cat-food", name: "Food & Dining", icon_name: "utensils-crossed", color: null, amount: "1240.00", share: 1, count: 5 },
  ],
  top_payee: null,
  biggest_spend: null,
  busiest_day: null,
  weekday: {
    totals: ["0", "0", "0", "0", "0", "0", "0"],
    peak_index: 0,
    weekend_share: 0,
  },
  no_spend_days: 0,
  longest_no_spend_streak: 0,
  first_week_share: 0,
  win: { kind: "none" },
  title: { id: "steady", evidence: {} },
};
