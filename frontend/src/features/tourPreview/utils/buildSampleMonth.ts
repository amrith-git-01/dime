import type { InfiniteData } from "@tanstack/react-query";
import {
  endOfMonth,
  format,
  getDaysInMonth,
  startOfDay,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns";

import {
  SEEDED_SYSTEM_CATEGORIES,
  type SeededSystemCategory,
} from "@/constants/systemCategories";
import type {
  CounterpartyIncomeRow,
  CounterpartySpendRow,
  DailyCashflowRow,
  MonthInsights,
} from "@/features/analytics/types";
import type { BudgetGetResponse } from "@/features/budgets/api/budgetsApi";
import type { CategoryBudgetItem } from "@/features/budgets/api/categoryBudgetsApi";
import type { CategoryRow } from "@/features/categories/types";
import type { ForecastResponse } from "@/features/forecast/types";
import { buildSampleForecast } from "@/features/forecast/utils/buildSampleForecast";
import type {
  RecurringItem,
  RecurringListResponse,
  RecurringMonthResponse,
  RecurringOccurrence,
} from "@/features/recurring/types";
import { monthSummaryDebitByCategory } from "@/features/transactions/monthSummaryDebitByCategory";
import type {
  CategoryScope,
  DayTransactionSummary,
  HomeOverview,
  MonthSummary,
  MonthSummaryCategoryMeta,
  TopCategoryHome,
  TransactionListPage,
  TransactionRow,
  TransactionType,
} from "@/features/transactions/types";

import { formatInrCompact } from "@/utils/currency";

import { tourSampleId } from "./sampleIds";

/**
 * A month of believable data for an empty screen, in the same shapes the API returns. It tells
 * the Welcome reel's October (see `reelStory.ts`): the same payees, a ₹18,620 month against a
 * ₹30,000 budget, ₹2,400 of it recurring, spread over food, shopping and transport.
 */
export type TourSampleMonth = {
  year: number;
  /** 0-11, like the app's month keys. */
  monthIndex0: number;
  homeOverview: HomeOverview;
  monthSummary: MonthSummary;
  /** `monthSummary.debit_by_category` as positive numbers (the budget screen's input). */
  debitTotalsByCategory: Record<string, number>;
  monthPages: InfiniteData<TransactionListPage, number>;
  recurringIncome: RecurringListResponse;
  recurringSubscriptions: RecurringListResponse;
  recurringMonth: RecurringMonthResponse;
  budget: BudgetGetResponse;
  categoryBudgets: CategoryBudgetItem[];
  insights: MonthInsights;
  /** The Insights "Ahead" section (meaningful for the current month only). */
  forecast: ForecastResponse;
};

export type BuildSampleMonthInput = {
  /** Multiplies the everyday spending (not the recurring items), to make a different month. */
  spendFactor?: number;
  /** Added to every sample row's id number, so two months never share ids. */
  idBase?: number;
  /** The device-local day the sample ends on (time of day is ignored). */
  today: Date;
  /** The current instant: no sample row is dated after it. Defaults to the end of `today`. */
  now?: Date;
  timezone: string;
  /** Owner stamped on the sample rows; they never leave the screen. */
  userId?: string;
  /** The app's cached categories: real ids, icons and colors win over the built-in seed. */
  categories?: readonly CategoryRow[];
};

type SampleCategory = {
  id: string;
  name: string;
  icon_name: string;
  color: string;
  scope: CategoryScope;
};

type SampleTx = {
  row: TransactionRow;
  dayKey: string;
  cents: number;
  fixed: boolean;
};

type Totals = {
  debit: number;
  credit: number;
  fixedDebit: number;
  fixedCredit: number;
  count: number;
};

const SAMPLE_USER_ID = "tour-sample-user";

const MONTHLY_BUDGET_CENTS = 30_000_00;
const FOOD_BUDGET_CENTS = 8_000_00;
const SHOPPING_BUDGET_CENTS = 6_000_00;
const TRANSPORT_BUDGET_CENTS = 4_000_00;
const SALARY_CENTS = 52_000_00;
/** The two recurring bills add up to the reel's ₹2,400 of recurring spend. */
const BROADBAND_CENTS = 1_751_00;
const NETFLIX_CENTS = 649_00;
const BROADBAND_DUE_DAY = 2;
const NETFLIX_DUE_DAY = 3;
/** Last month's everyday spending relative to this month's (the reel's food: ₹7,076 is 18% below ₹8,630). */
export const PREVIOUS_MONTH_SPEND_FACTOR = 1.22;

/**
 * Everyday spending, newest first by `daysAgo`; days before the 1st fold onto the 1st. The five
 * newest are the reel's story read backwards (Chai, Smoor, Zepto, Rapido, Swiggy). Food adds up
 * to ₹7,076, shopping ₹5,030, transport ₹3,540 and the pharmacy ₹574: ₹16,220 of flexible spend.
 */
const SPEND_TEMPLATE = [
  { merchant: "Chai", category: "food", rupees: 120, daysAgo: 0, hour: 9, minute: 10 },
  { merchant: "Smoor", category: "food", rupees: 480, daysAgo: 0, hour: 8, minute: 15 },
  { merchant: "Zepto", category: "shopping", rupees: 860, daysAgo: 1, hour: 19, minute: 40 },
  { merchant: "Rapido", category: "transport", rupees: 45, daysAgo: 1, hour: 18, minute: 5 },
  { merchant: "Swiggy", category: "food", rupees: 250, daysAgo: 2, hour: 21, minute: 10 },
  { merchant: "Uber", category: "transport", rupees: 215, daysAgo: 3, hour: 9, minute: 30 },
  { merchant: "Zomato", category: "food", rupees: 620, daysAgo: 3, hour: 13, minute: 20 },
  { merchant: "Amazon", category: "shopping", rupees: 1899, daysAgo: 4, hour: 15, minute: 45 },
  { merchant: "BigBasket", category: "food", rupees: 1420, daysAgo: 5, hour: 19, minute: 20 },
  { merchant: "Uber", category: "transport", rupees: 340, daysAgo: 6, hour: 18, minute: 30 },
  { merchant: "Zomato", category: "food", rupees: 540, daysAgo: 6, hour: 13, minute: 15 },
  { merchant: "Apollo Pharmacy", category: "health", rupees: 574, daysAgo: 7, hour: 11, minute: 10 },
  { merchant: "Myntra", category: "shopping", rupees: 1472, daysAgo: 8, hour: 20, minute: 5 },
  { merchant: "Blinkit", category: "food", rupees: 836, daysAgo: 9, hour: 22, minute: 15 },
  { merchant: "Ola", category: "transport", rupees: 380, daysAgo: 9, hour: 8, minute: 50 },
  { merchant: "Haldiram's", category: "food", rupees: 560, daysAgo: 10, hour: 17, minute: 25 },
  { merchant: "Amazon", category: "shopping", rupees: 799, daysAgo: 11, hour: 11, minute: 50 },
  { merchant: "Swiggy", category: "food", rupees: 390, daysAgo: 12, hour: 20, minute: 25 },
  { merchant: "IRCTC", category: "transport", rupees: 1840, daysAgo: 13, hour: 10, minute: 35 },
  { merchant: "Uber", category: "transport", rupees: 260, daysAgo: 14, hour: 9, minute: 55 },
  { merchant: "BigBasket", category: "food", rupees: 1150, daysAgo: 15, hour: 10, minute: 35 },
  { merchant: "Zomato", category: "food", rupees: 710, daysAgo: 16, hour: 14, minute: 5 },
  { merchant: "Metro", category: "transport", rupees: 460, daysAgo: 17, hour: 8, minute: 20 },
] as const;

type SpendCategoryKey = (typeof SPEND_TEMPLATE)[number]["category"];

const TOP_PAYEES = 4;
const TOP_EXPENSES = 5;
const TOP_CATEGORIES = 5;
const RECENT_COUNT = 5;

const dayKeyOf = (date: Date): string => format(date, "yyyy-MM-dd");

/** Integer paise as a decimal string, like the API's `formatCents`. */
function formatPaise(paise: number): string {
  const abs = Math.abs(paise);
  const fraction = String(abs % 100).padStart(2, "0");
  return `${paise < 0 ? "-" : ""}${Math.floor(abs / 100)}.${fraction}`;
}

const paiseOrZero = (paise: number): string => (paise === 0 ? "0" : formatPaise(paise));

const payeeKeyOf = (name: string): string => name.trim().toLowerCase();

function resolveCategory(
  seed: SeededSystemCategory,
  cached: readonly CategoryRow[],
): SampleCategory {
  const wanted = seed.name.toLowerCase();
  const match = cached.find(
    (category) => category.is_system && category.name.trim().toLowerCase() === wanted,
  );
  return match
    ? {
        id: match.id,
        name: match.name.trim(),
        icon_name: match.icon_name,
        color: match.color,
        scope: match.scope ?? seed.scope,
      }
    : { ...seed };
}

function emptyTotals(): Totals {
  return { debit: 0, credit: 0, fixedDebit: 0, fixedCredit: 0, count: 0 };
}

function addToTotals(totals: Totals, tx: SampleTx): void {
  totals.count += 1;
  if (tx.row.type === "debit") {
    totals.debit += tx.cents;
    if (tx.fixed) totals.fixedDebit += tx.cents;
  } else {
    totals.credit += tx.cents;
    if (tx.fixed) totals.fixedCredit += tx.cents;
  }
}

function sumTotals(txs: readonly SampleTx[]): Totals {
  const totals = emptyTotals();
  for (const tx of txs) addToTotals(totals, tx);
  return totals;
}

function byNewest(a: SampleTx, b: SampleTx): number {
  if (a.row.transaction_at !== b.row.transaction_at) {
    return a.row.transaction_at < b.row.transaction_at ? 1 : -1;
  }
  return a.row.id < b.row.id ? -1 : 1;
}

function shareOf(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 10_000) / 10_000 : 0;
}

/**
 * Builds a consistent sample month for the CURRENT month of `today`: every shape the Home,
 * Transactions, Budgets and Insights screens read, derived from one list of transactions so the
 * totals, splits and per-day summaries always add up. Pure: no cache, no clock, no network.
 */
export function buildSampleMonth(input: BuildSampleMonthInput): TourSampleMonth {
  const today = startOfDay(input.today);
  // Never in the future: rows "later today" (or folded onto the 1st) are pulled back to just before now.
  const nowMs = input.now?.getTime() ?? today.getTime() + 24 * 60 * 60 * 1000 - 1;
  let futureClamps = 0;
  const year = today.getFullYear();
  const monthIndex0 = today.getMonth();
  const calendarMonth = monthIndex0 + 1;
  const todayDate = today.getDate();
  const todayKey = dayKeyOf(today);
  const daysInMonth = getDaysInMonth(today);
  const userId = input.userId ?? SAMPLE_USER_ID;
  const cached = input.categories ?? [];
  const monthStartIso = new Date(year, monthIndex0, 1).toISOString();

  const categories = {
    food: resolveCategory(SEEDED_SYSTEM_CATEGORIES.food, cached),
    shopping: resolveCategory(SEEDED_SYSTEM_CATEGORIES.shopping, cached),
    transport: resolveCategory(SEEDED_SYSTEM_CATEGORIES.transport, cached),
    health: resolveCategory(SEEDED_SYSTEM_CATEGORIES.health, cached),
    internet: resolveCategory(SEEDED_SYSTEM_CATEGORIES.internet, cached),
    subscriptions: resolveCategory(SEEDED_SYSTEM_CATEGORIES.subscriptions, cached),
    salary: resolveCategory(SEEDED_SYSTEM_CATEGORIES.salary, cached),
  } satisfies Record<SpendCategoryKey | "internet" | "subscriptions" | "salary", SampleCategory>;
  const spendFactor = input.spendFactor ?? 1;
  const idBase = input.idBase ?? 0;

  // ── Transactions ──────────────────────────────────────────────────────────
  const makeTx = (spec: {
    id: string;
    merchant: string;
    category: SampleCategory;
    type: TransactionType;
    cents: number;
    day: number;
    hour: number;
    minute: number;
    recurringItemId?: string;
  }): SampleTx => {
    let atMs = new Date(year, monthIndex0, spec.day, spec.hour, spec.minute).getTime();
    if (atMs > nowMs) {
      futureClamps += 1;
      atMs = Math.max(today.getTime(), nowMs - futureClamps * 60_000);
    }
    const at = new Date(atMs).toISOString();
    return {
      // The day it really falls on (a row later than now is pulled back onto today).
      dayKey: dayKeyOf(new Date(atMs)),
      cents: spec.cents,
      fixed: spec.category.scope !== "spend",
      row: {
        id: spec.id,
        user_id: userId,
        amount: formatPaise(spec.cents),
        type: spec.type,
        counterparty_name: spec.merchant,
        counterparty_type: "merchant",
        counterparty_normalized: payeeKeyOf(spec.merchant),
        merchant: spec.merchant,
        category: spec.category.name,
        category_id: spec.category.id,
        category_icon_name: spec.category.icon_name,
        category_color: spec.category.color,
        category_scope: spec.category.scope,
        recurring_item_id: spec.recurringItemId ?? null,
        note: null,
        detected_via: "manual",
        transaction_at: at,
        created_at: at,
        updated_at: at,
        deleted_at: null,
        receipt_url: null,
        voice_url: null,
      },
    };
  };

  const broadbandItemId = tourSampleId(idBase + 1);
  const salaryItemId = tourSampleId(idBase + 2);
  const netflixItemId = tourSampleId(idBase + 3);

  const spendTxs = SPEND_TEMPLATE.map((spec, index) =>
    makeTx({
      id: tourSampleId(idBase + 100 + index),
      merchant: spec.merchant,
      category: categories[spec.category],
      type: "debit",
      cents: Math.round(spec.rupees * spendFactor) * 100,
      day: Math.max(1, todayDate - spec.daysAgo),
      hour: spec.hour,
      minute: spec.minute,
    }),
  );
  // The recurring bills and the salary are all posted early in the month, so the month's
  // totals stay the same whichever day the tour runs on.
  const broadbandTx = makeTx({
    id: tourSampleId(idBase + 200),
    merchant: "Broadband",
    category: categories.internet,
    type: "debit",
    cents: BROADBAND_CENTS,
    day: BROADBAND_DUE_DAY,
    hour: 9,
    minute: 0,
    recurringItemId: broadbandItemId,
  });
  const salaryTx = makeTx({
    id: tourSampleId(idBase + 201),
    merchant: "Salary",
    category: categories.salary,
    type: "credit",
    cents: SALARY_CENTS,
    day: 1,
    hour: 10,
    minute: 0,
    recurringItemId: salaryItemId,
  });
  const netflixTx = makeTx({
    id: tourSampleId(idBase + 202),
    merchant: "Netflix",
    category: categories.subscriptions,
    type: "debit",
    cents: NETFLIX_CENTS,
    day: NETFLIX_DUE_DAY,
    hour: 11,
    minute: 0,
    recurringItemId: netflixItemId,
  });

  const txs = [...spendTxs, broadbandTx, salaryTx, netflixTx].sort(byNewest);
  const flexibleDebits = txs.filter((tx) => tx.row.type === "debit" && !tx.fixed);
  const month = sumTotals(txs);

  const txsByDay = new Map<string, SampleTx[]>();
  for (const tx of txs) {
    txsByDay.set(tx.dayKey, [...(txsByDay.get(tx.dayKey) ?? []), tx]);
  }
  const dayTotals = new Map<string, Totals>(
    [...txsByDay].map(([day, dayTxs]) => [day, sumTotals(dayTxs)]),
  );

  // ── Month summary ─────────────────────────────────────────────────────────
  const debitByCategoryCents = new Map<string, number>();
  const metaById = new Map<string, MonthSummaryCategoryMeta>();
  for (const tx of txs) {
    if (tx.row.type !== "debit" || tx.row.category_id === null) continue;
    debitByCategoryCents.set(
      tx.row.category_id,
      (debitByCategoryCents.get(tx.row.category_id) ?? 0) + tx.cents,
    );
    if (!metaById.has(tx.row.category_id)) {
      metaById.set(tx.row.category_id, {
        id: tx.row.category_id,
        name: tx.row.category ?? "",
        icon_name: tx.row.category_icon_name,
        color: tx.row.category_color,
        scope: tx.row.category_scope ?? undefined,
      });
    }
  }
  const debit_by_category: Record<string, string> = {};
  for (const [categoryId, cents] of debitByCategoryCents) {
    debit_by_category[categoryId] = formatPaise(cents);
  }

  const splitFields = (totals: Totals) => ({
    fixed_debit_total: formatPaise(totals.fixedDebit),
    flexible_debit_total: formatPaise(totals.debit - totals.fixedDebit),
    fixed_credit_total: formatPaise(totals.fixedCredit),
    flexible_credit_total: formatPaise(totals.credit - totals.fixedCredit),
  });

  const monthSummary: MonthSummary = {
    credit_total: formatPaise(month.credit),
    debit_total: formatPaise(month.debit),
    net: formatPaise(month.credit - month.debit),
    transaction_count: month.count,
    ...splitFields(month),
    debit_by_category,
    category_meta: [...metaById.values()],
  };

  // ── Month pages (one page; per-day summaries on it) ───────────────────────
  const day_summaries: Record<string, DayTransactionSummary> = {};
  for (const [date, totals] of [...dayTotals].sort(([a], [b]) => (a < b ? -1 : 1))) {
    day_summaries[date] = {
      date,
      credit_total: formatPaise(totals.credit),
      debit_total: formatPaise(totals.debit),
      fixed_debit_total: formatPaise(totals.fixedDebit),
      fixed_credit_total: formatPaise(totals.fixedCredit),
      net: formatPaise(totals.credit - totals.debit),
      transaction_count: totals.count,
    };
  }
  const monthPages: InfiniteData<TransactionListPage, number> = {
    pages: [{ items: txs.map((tx) => tx.row), has_more: false, day_summaries }],
    pageParams: [0],
  };

  // ── Home overview ─────────────────────────────────────────────────────────
  const flexibleByCategory = new Map<string, number>();
  for (const tx of flexibleDebits) {
    if (tx.row.category_id === null) continue;
    flexibleByCategory.set(
      tx.row.category_id,
      (flexibleByCategory.get(tx.row.category_id) ?? 0) + tx.cents,
    );
  }
  const top_categories: TopCategoryHome[] = [...flexibleByCategory]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_CATEGORIES)
    .map(([categoryId, cents]) => {
      const meta = metaById.get(categoryId);
      return {
        category_id: categoryId,
        name: meta?.name ?? "",
        icon_name: meta?.icon_name ?? null,
        color: meta?.color ?? null,
        total: formatPaise(cents),
      };
    });

  const homeOverview: HomeOverview = {
    spent_today: paiseOrZero(dayTotals.get(todayKey)?.debit ?? 0),
    spent_this_month: formatPaise(month.debit),
    fixed_spent_this_month: formatPaise(month.fixedDebit),
    flexible_spent_this_month: formatPaise(month.debit - month.fixedDebit),
    top_categories,
    recent_transactions: txs.slice(0, RECENT_COUNT).map((tx) => tx.row),
    // Exactly seven rows ending on device-local today: any other window makes Home refetch.
    last_7_days_spend: Array.from({ length: 7 }, (_, index) => {
      const date = dayKeyOf(subDays(today, 6 - index));
      return { date, total: paiseOrZero(dayTotals.get(date)?.debit ?? 0) };
    }),
  };

  // ── Recurring ─────────────────────────────────────────────────────────────
  const nextMonth = new Date(year, monthIndex0 + 1, 1);
  const nextDueDate = (day: number): string =>
    dayKeyOf(new Date(year, monthIndex0 + 1, Math.min(day, getDaysInMonth(nextMonth))));
  const thisMonthDate = (day: number): string => dayKeyOf(new Date(year, monthIndex0, day));

  const makeItem = (spec: {
    id: string;
    kind: RecurringItem["kind"];
    name: string;
    cents: number;
    category: SampleCategory;
    day: number;
  }): RecurringItem => ({
    id: spec.id,
    kind: spec.kind,
    name: spec.name,
    amount: formatPaise(spec.cents),
    category_id: spec.category.id,
    category: spec.category.name,
    category_icon_name: spec.category.icon_name,
    category_color: spec.category.color,
    cadence: "monthly",
    day_of_month: spec.day,
    month_of_year: null,
    timezone: input.timezone,
    next_due_date: nextDueDate(spec.day),
    active: true,
    note: null,
    monthly_equivalent: formatPaise(spec.cents),
    created_at: monthStartIso,
    updated_at: monthStartIso,
  });

  const broadbandItem = makeItem({
    id: broadbandItemId,
    kind: "subscription",
    name: "Broadband",
    cents: BROADBAND_CENTS,
    category: categories.internet,
    day: BROADBAND_DUE_DAY,
  });
  const netflixItem = makeItem({
    id: netflixItemId,
    kind: "subscription",
    name: "Netflix",
    cents: NETFLIX_CENTS,
    category: categories.subscriptions,
    day: NETFLIX_DUE_DAY,
  });
  const salaryItem = makeItem({
    id: salaryItemId,
    kind: "income",
    name: "Salary",
    cents: SALARY_CENTS,
    category: categories.salary,
    day: 1,
  });

  const recurringSummary = {
    monthly_income_total: formatPaise(SALARY_CENTS),
    monthly_subscriptions_total: formatPaise(BROADBAND_CENTS + NETFLIX_CENTS),
  };
  const recurringIncome: RecurringListResponse = {
    items: [salaryItem],
    summary: recurringSummary,
  };
  const recurringSubscriptions: RecurringListResponse = {
    items: [broadbandItem, netflixItem],
    summary: recurringSummary,
  };

  const occurrenceCategory = (category: SampleCategory): RecurringOccurrence["category"] => ({
    id: category.id,
    name: category.name,
    icon_name: category.icon_name,
    color: category.color,
    scope: category.scope,
  });
  const paidOccurrence = (item: RecurringItem, tx: SampleTx, category: SampleCategory) =>
    ({
      id: item.id,
      kind: item.kind,
      name: item.name,
      amount: item.amount,
      category: occurrenceCategory(category),
      due_date: tx.dayKey,
      status: "paid",
      transaction_id: tx.row.id,
      posted_amount: tx.row.amount,
    }) satisfies RecurringOccurrence;

  const unsortedOccurrences: RecurringOccurrence[] = [
    paidOccurrence(broadbandItem, broadbandTx, categories.internet),
    paidOccurrence(salaryItem, salaryTx, categories.salary),
    paidOccurrence(netflixItem, netflixTx, categories.subscriptions),
  ];
  const occurrences = unsortedOccurrences.sort((a, b) =>
    a.due_date === b.due_date
      ? a.name.localeCompare(b.name)
      : a.due_date < b.due_date
        ? -1
        : 1,
  );

  const recurringMonth: RecurringMonthResponse = {
    year,
    month: calendarMonth,
    items: occurrences,
    totals: {
      fixed_expense_paid: formatPaise(BROADBAND_CENTS + NETFLIX_CENTS),
      fixed_expense_upcoming: formatPaise(0),
      fixed_income_received: formatPaise(SALARY_CENTS),
      fixed_income_upcoming: formatPaise(0),
    },
  };

  // ── Budgets ───────────────────────────────────────────────────────────────
  const budget: BudgetGetResponse = {
    budget: {
      id: tourSampleId(idBase + 10),
      user_id: userId,
      monthly_budget: formatPaise(MONTHLY_BUDGET_CENTS),
      created_at: monthStartIso,
      updated_at: monthStartIso,
    },
  };
  const categoryBudgets: CategoryBudgetItem[] = [
    { category_id: categories.food.id, monthly_amount: formatPaise(FOOD_BUDGET_CENTS) },
    { category_id: categories.shopping.id, monthly_amount: formatPaise(SHOPPING_BUDGET_CENTS) },
    { category_id: categories.transport.id, monthly_amount: formatPaise(TRANSPORT_BUDGET_CENTS) },
  ];

  // ── Insights ──────────────────────────────────────────────────────────────
  const daily_cashflow: DailyCashflowRow[] = Array.from({ length: daysInMonth }, (_, index) => {
    const date = thisMonthDate(index + 1);
    const totals = dayTotals.get(date);
    return {
      date,
      debit_total: paiseOrZero(totals?.debit ?? 0),
      credit_total: paiseOrZero(totals?.credit ?? 0),
      fixed_debit_total: paiseOrZero(totals?.fixedDebit ?? 0),
      fixed_credit_total: paiseOrZero(totals?.fixedCredit ?? 0),
    };
  });

  // "Who you paid" is flexible spend only, so its shares are of the flexible total.
  const flexibleDebitCents = month.debit - month.fixedDebit;
  const spendByPayee = new Map<string, { name: string; cents: number; count: number }>();
  for (const tx of flexibleDebits) {
    const key = tx.row.counterparty_normalized ?? payeeKeyOf(tx.row.merchant);
    const current = spendByPayee.get(key) ?? { name: tx.row.merchant, cents: 0, count: 0 };
    spendByPayee.set(key, {
      name: current.name,
      cents: current.cents + tx.cents,
      count: current.count + 1,
    });
  }
  const rankedPayees = [...spendByPayee]
    .map(([payee_key, value]) => ({ payee_key, ...value }))
    .sort((a, b) => b.cents - a.cents);
  const counterparty_spend: CounterpartySpendRow[] = rankedPayees
    .slice(0, TOP_PAYEES)
    .map((payee) => ({
      payee_key: payee.payee_key,
      display_name: payee.name,
      debit_total: formatPaise(payee.cents),
      share: shareOf(payee.cents, flexibleDebitCents),
      transaction_count: payee.count,
    }));
  const otherPayees = rankedPayees.slice(TOP_PAYEES);
  if (otherPayees.length > 0) {
    const otherCents = otherPayees.reduce((sum, payee) => sum + payee.cents, 0);
    counterparty_spend.push({
      payee_key: "__other__",
      display_name: "Other",
      debit_total: formatPaise(otherCents),
      share: shareOf(otherCents, flexibleDebitCents),
      transaction_count: otherPayees.reduce((sum, payee) => sum + payee.count, 0),
    });
  }

  const counterparty_income: CounterpartyIncomeRow[] = [
    {
      payee_key: payeeKeyOf("Salary"),
      display_name: "Salary",
      credit_total: formatPaise(month.credit),
      share: shareOf(month.credit, month.credit),
      transaction_count: txs.filter((tx) => tx.row.type === "credit").length,
    },
  ];

  const insights: MonthInsights = {
    year,
    month: calendarMonth,
    today: todayKey,
    summary: {
      credit_total: monthSummary.credit_total,
      debit_total: monthSummary.debit_total,
      net: monthSummary.net,
      transaction_count: month.count,
      ...splitFields(month),
    },
    daily_cashflow,
    counterparty_spend,
    counterparty_income,
    top_expenses: [...flexibleDebits]
      .sort((a, b) => b.cents - a.cents || byNewest(a, b))
      .slice(0, TOP_EXPENSES)
      .map((tx) => tx.row),
  };

  const sampleCategory = (
    category: SampleCategory,
    budgetCents: number,
    usualCents: number,
    projectedCents: number,
  ) => ({
    id: category.id,
    name: category.name,
    iconName: category.icon_name,
    color: category.color,
    spentCents: debitByCategoryCents.get(category.id) ?? 0,
    budgetCents,
    usualCents,
    projectedCents,
  });
  const forecast = buildSampleForecast({
    today,
    timezone: input.timezone,
    idFor: (n) => tourSampleId(idBase + n),
    spentCents: month.debit,
    budgetCents: MONTHLY_BUDGET_CENTS,
    bills: [
      { name: "Broadband", cents: BROADBAND_CENTS, dueDay: BROADBAND_DUE_DAY },
      { name: "Netflix", cents: NETFLIX_CENTS, dueDay: NETFLIX_DUE_DAY },
    ],
    incomes: [{ name: "Salary", cents: SALARY_CENTS, dueDay: 1 }],
    categories: [
      sampleCategory(categories.food, FOOD_BUDGET_CENTS, 6_200_00, 7_900_00),
      sampleCategory(categories.shopping, SHOPPING_BUDGET_CENTS, 5_000_00, 5_400_00),
      sampleCategory(categories.transport, TRANSPORT_BUDGET_CENTS, 3_600_00, 3_700_00),
    ],
    unusual: insights.top_expenses[0]
      ? {
          transactionId: insights.top_expenses[0].id,
          merchant: insights.top_expenses[0].merchant,
          cents: Math.round(Number(insights.top_expenses[0].amount) * 100),
        }
      : null,
    formatRupees: (cents) => formatInrCompact(cents / 100),
  });

  return {
    year,
    monthIndex0,
    homeOverview,
    monthSummary,
    debitTotalsByCategory: monthSummaryDebitByCategory(monthSummary),
    monthPages,
    recurringIncome,
    recurringSubscriptions,
    recurringMonth,
    budget,
    categoryBudgets,
    insights,
    forecast,
  };
}

/** What the sample covers: the current month, and last month so the arrows and "compare" have something to show. */
export type TourSampleSet = {
  current: TourSampleMonth;
  previous: TourSampleMonth;
};

/** Builds this month's sample and last month's (everyday spending a little higher, the same bills). */
export function buildSampleSet(input: BuildSampleMonthInput): TourSampleSet {
  const today = startOfDay(input.today);
  const previousDay = endOfMonth(subMonths(startOfMonth(today), 1));
  return {
    current: buildSampleMonth(input),
    previous: buildSampleMonth({
      ...input,
      today: previousDay,
      now: undefined,
      spendFactor: PREVIOUS_MONTH_SPEND_FACTOR,
      idBase: 1000,
    }),
  };
}

/**
 * The sample for a calendar month, or undefined when the sample does not cover it. `past` marks
 * last month: it only stands in when the whole account is empty, never beside real current data.
 */
export function pickSampleMonth(
  set: TourSampleSet,
  year: number,
  monthIndex0: number,
): { month: TourSampleMonth; past: boolean } | undefined {
  if (isSampleMonth(set.current, year, monthIndex0)) {
    return { month: set.current, past: false };
  }
  if (isSampleMonth(set.previous, year, monthIndex0)) {
    return { month: set.previous, past: true };
  }
  return undefined;
}

/** Whether `sample` was built for this calendar month. */
export function isSampleMonth(
  sample: TourSampleMonth,
  year: number,
  monthIndex0: number,
): boolean {
  return sample.year === year && sample.monthIndex0 === monthIndex0;
}
