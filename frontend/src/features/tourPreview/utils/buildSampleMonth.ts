import type { InfiniteData } from "@tanstack/react-query";
import { format, getDaysInMonth, startOfDay, subDays } from "date-fns";

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

import { tourSampleId } from "./sampleIds";

/** A month of believable data for an empty account, in the same shapes the API returns. */
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
};

export type BuildSampleMonthInput = {
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
const SHOPPING_BUDGET_CENTS = 5_000_00;
const RENT_CENTS = 15_000_00;
const SALARY_CENTS = 60_000_00;
const NETFLIX_CENTS = 649_00;
const NETFLIX_DUE_DAY = 18;

/** Everyday spending, newest first by `daysAgo`; days before the 1st fold onto the 1st. */
const SPEND_TEMPLATE = [
  { merchant: "Zomato", category: "food", rupees: 480, daysAgo: 0, hour: 8, minute: 40 },
  { merchant: "Uber", category: "transport", rupees: 215, daysAgo: 0, hour: 8, minute: 5 },
  { merchant: "BigBasket", category: "food", rupees: 1420, daysAgo: 1, hour: 19, minute: 20 },
  { merchant: "Swiggy", category: "food", rupees: 620, daysAgo: 2, hour: 21, minute: 10 },
  { merchant: "Amazon", category: "shopping", rupees: 1899, daysAgo: 3, hour: 15, minute: 45 },
  { merchant: "Uber", category: "transport", rupees: 340, daysAgo: 4, hour: 18, minute: 30 },
  { merchant: "Zomato", category: "food", rupees: 540, daysAgo: 6, hour: 13, minute: 15 },
  { merchant: "Amazon", category: "shopping", rupees: 799, daysAgo: 8, hour: 11, minute: 50 },
  { merchant: "Swiggy", category: "food", rupees: 390, daysAgo: 9, hour: 20, minute: 25 },
  { merchant: "BigBasket", category: "food", rupees: 1150, daysAgo: 11, hour: 10, minute: 35 },
  { merchant: "Uber", category: "transport", rupees: 260, daysAgo: 13, hour: 9, minute: 55 },
  { merchant: "Zomato", category: "food", rupees: 710, daysAgo: 15, hour: 14, minute: 5 },
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
    rent: resolveCategory(SEEDED_SYSTEM_CATEGORIES.rent, cached),
    subscriptions: resolveCategory(SEEDED_SYSTEM_CATEGORIES.subscriptions, cached),
    salary: resolveCategory(SEEDED_SYSTEM_CATEGORIES.salary, cached),
  } satisfies Record<SpendCategoryKey | "rent" | "subscriptions" | "salary", SampleCategory>;

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
      dayKey: dayKeyOf(new Date(year, monthIndex0, spec.day)),
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

  const rentItemId = tourSampleId(1);
  const salaryItemId = tourSampleId(2);
  const netflixItemId = tourSampleId(3);

  // Netflix is due on the 18th, or tomorrow once the 18th has passed; on the last days of the
  // month there is no later date left, so it has already been paid on the 18th.
  const netflixUpcomingDay = Math.max(NETFLIX_DUE_DAY, todayDate + 1);
  const netflixPaid = netflixUpcomingDay > daysInMonth;
  const netflixDay = netflixPaid ? NETFLIX_DUE_DAY : netflixUpcomingDay;

  const spendTxs = SPEND_TEMPLATE.map((spec, index) =>
    makeTx({
      id: tourSampleId(100 + index),
      merchant: spec.merchant,
      category: categories[spec.category],
      type: "debit",
      cents: spec.rupees * 100,
      day: Math.max(1, todayDate - spec.daysAgo),
      hour: spec.hour,
      minute: spec.minute,
    }),
  );
  const rentTx = makeTx({
    id: tourSampleId(200),
    merchant: "Rent",
    category: categories.rent,
    type: "debit",
    cents: RENT_CENTS,
    day: 1,
    hour: 9,
    minute: 0,
    recurringItemId: rentItemId,
  });
  const salaryTx = makeTx({
    id: tourSampleId(201),
    merchant: "Salary",
    category: categories.salary,
    type: "credit",
    cents: SALARY_CENTS,
    day: 1,
    hour: 10,
    minute: 0,
    recurringItemId: salaryItemId,
  });
  const netflixTx = netflixPaid
    ? makeTx({
        id: tourSampleId(202),
        merchant: "Netflix",
        category: categories.subscriptions,
        type: "debit",
        cents: NETFLIX_CENTS,
        day: netflixDay,
        hour: 11,
        minute: 0,
        recurringItemId: netflixItemId,
      })
    : null;

  const txs = [...spendTxs, rentTx, salaryTx, ...(netflixTx ? [netflixTx] : [])].sort(byNewest);
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
    posted: boolean;
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
    next_due_date: spec.posted ? nextDueDate(spec.day) : thisMonthDate(spec.day),
    active: true,
    note: null,
    monthly_equivalent: formatPaise(spec.cents),
    created_at: monthStartIso,
    updated_at: monthStartIso,
  });

  const rentItem = makeItem({
    id: rentItemId,
    kind: "subscription",
    name: "Rent",
    cents: RENT_CENTS,
    category: categories.rent,
    day: 1,
    posted: true,
  });
  const netflixItem = makeItem({
    id: netflixItemId,
    kind: "subscription",
    name: "Netflix",
    cents: NETFLIX_CENTS,
    category: categories.subscriptions,
    day: netflixDay,
    posted: netflixPaid,
  });
  const salaryItem = makeItem({
    id: salaryItemId,
    kind: "income",
    name: "Salary",
    cents: SALARY_CENTS,
    category: categories.salary,
    day: 1,
    posted: true,
  });

  const recurringSummary = {
    monthly_income_total: formatPaise(SALARY_CENTS),
    monthly_subscriptions_total: formatPaise(RENT_CENTS + NETFLIX_CENTS),
  };
  const recurringIncome: RecurringListResponse = {
    items: [salaryItem],
    summary: recurringSummary,
  };
  const recurringSubscriptions: RecurringListResponse = {
    items: [rentItem, netflixItem],
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
    paidOccurrence(rentItem, rentTx, categories.rent),
    paidOccurrence(salaryItem, salaryTx, categories.salary),
    netflixTx
      ? paidOccurrence(netflixItem, netflixTx, categories.subscriptions)
      : {
          id: netflixItem.id,
          kind: netflixItem.kind,
          name: netflixItem.name,
          amount: netflixItem.amount,
          category: occurrenceCategory(categories.subscriptions),
          due_date: thisMonthDate(netflixDay),
          status: "upcoming",
        },
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
      fixed_expense_paid: formatPaise(RENT_CENTS + (netflixTx ? NETFLIX_CENTS : 0)),
      fixed_expense_upcoming: formatPaise(netflixTx ? 0 : NETFLIX_CENTS),
      fixed_income_received: formatPaise(SALARY_CENTS),
      fixed_income_upcoming: formatPaise(0),
    },
  };

  // ── Budgets ───────────────────────────────────────────────────────────────
  const budget: BudgetGetResponse = {
    budget: {
      id: tourSampleId(10),
      user_id: userId,
      monthly_budget: formatPaise(MONTHLY_BUDGET_CENTS),
      created_at: monthStartIso,
      updated_at: monthStartIso,
    },
  };
  const categoryBudgets: CategoryBudgetItem[] = [
    { category_id: categories.food.id, monthly_amount: formatPaise(FOOD_BUDGET_CENTS) },
    { category_id: categories.shopping.id, monthly_amount: formatPaise(SHOPPING_BUDGET_CENTS) },
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
  };
}

/** Sample data only stands in for the month it was built for; every other month stays real. */
export function isSampleMonth(
  sample: TourSampleMonth,
  year: number,
  monthIndex0: number,
): boolean {
  return sample.year === year && sample.monthIndex0 === monthIndex0;
}
