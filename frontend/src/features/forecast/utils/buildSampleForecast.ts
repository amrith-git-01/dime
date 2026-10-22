import { addDays, format } from "date-fns";

import type {
  ForecastCategory,
  ForecastResponse,
  ForecastUpcomingItem,
  ForecastWatchItem,
  ForecastWeekday,
} from "../types";

export type SampleForecastCategory = {
  id: string;
  name: string;
  iconName: string;
  color: string;
  spentCents: number;
  budgetCents: number;
  /** The usual month-end spend, and the projection the sample should show (never below `spentCents`). */
  usualCents: number;
  projectedCents: number;
};

export type BuildSampleForecastInput = {
  /** The device-local day the sample ends on. */
  today: Date;
  timezone: string;
  /** Sample row ids come from here, so two months never share them. */
  idFor: (n: number) => string;
  spentCents: number;
  budgetCents: number;
  /** Subscriptions and salary whose next due date may fall inside the next 14 days. */
  bills: { name: string; cents: number; dueDay: number }[];
  incomes: { name: string; cents: number; dueDay: number }[];
  categories: SampleForecastCategory[];
  unusual: { transactionId: string; merchant: string; cents: number } | null;
  formatRupees: (cents: number) => string;
};

const HISTORY_DAYS = 96;
const DAILY_FLEXIBLE_CENTS = 520_00;
const UPCOMING_DAYS = 14;

const decimal = (cents: number): string => (cents / 100).toFixed(2);
const dayKey = (date: Date): string => format(date, "yyyy-MM-dd");

/**
 * A believable "Ahead" payload for the guided tour (same shape as `GET /forecast`), so the
 * Insights tour can show the hero, Coming up and Watch on an empty account. Pure; the figures
 * follow the sample month: ₹18,620 spent so far against a ₹30,000 budget, landing near ₹28,900.
 */
export function buildSampleForecast(input: BuildSampleForecastInput): ForecastResponse {
  const { today, spentCents, budgetCents } = input;
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const daysInMonth = new Date(year, month, 0).getDate();
  const remainingDays = daysInMonth - today.getDate();

  const targetCents = Math.min(
    spentCents + remainingDays * DAILY_FLEXIBLE_CENTS,
    Math.max(spentCents, Math.round(budgetCents * 0.963)),
  );
  const flexibleRemaining = Math.max(0, targetCents - spentCents);
  const p50 = spentCents + flexibleRemaining;
  const p10 = spentCents + Math.round(flexibleRemaining * 0.82);
  const p90 = spentCents + Math.round(flexibleRemaining * 1.35);

  const weekday = format(today, "EEE") as ForecastWeekday;
  const safeCents = Math.max(
    0,
    Math.round((budgetCents - spentCents) / (remainingDays + 1)),
  );

  const categories: ForecastCategory[] = input.categories.map((category) => {
    const p50Cents = Math.max(category.spentCents, category.projectedCents);
    return {
      id: category.id,
      name: category.name,
      iconName: category.iconName,
      color: category.color,
      spent: decimal(category.spentCents),
      p50: decimal(p50Cents),
      budget: decimal(category.budgetCents),
      baseline: decimal(category.usualCents),
      status:
        p50Cents > category.budgetCents
          ? "over"
          : p50Cents > category.usualCents * 1.25
            ? "hot"
            : "ok",
    };
  });
  const hot = categories.find((category) => category.status !== "ok");

  const upcoming: ForecastUpcomingItem[] = [
    { name: "Swiggy", cents: 350_00, offset: 1, confidence: 0.82 },
    { name: "Zomato", cents: 540_00, offset: 2, confidence: 0.74 },
    { name: "Uber", cents: 260_00, offset: 4, confidence: 0.63 },
  ].map((likely, index) => ({
    id: input.idFor(300 + index),
    kind: "likely" as const,
    name: likely.name,
    amount: decimal(likely.cents),
    date: dayKey(addDays(today, likely.offset)),
    payeeKey: likely.name.toLowerCase(),
    confidence: likely.confidence,
  }));
  const horizon = addDays(today, UPCOMING_DAYS);
  const nextMonthDue = (dueDay: number): Date =>
    new Date(year, month, Math.min(dueDay, new Date(year, month + 1, 0).getDate()));
  [
    ...input.bills.map((bill) => ({ ...bill, kind: "bill" as const })),
    ...input.incomes.map((income) => ({ ...income, kind: "income" as const })),
  ].forEach((entry, index) => {
    const due = nextMonthDue(entry.dueDay);
    if (due > today && due <= horizon) {
      upcoming.push({
        id: input.idFor(310 + index),
        kind: entry.kind,
        name: entry.name,
        amount: decimal(entry.cents),
        date: dayKey(due),
      });
    }
  });

  const watch: ForecastWatchItem[] = [];
  if (hot?.id) {
    watch.push({
      id: input.idFor(320),
      kind: "category_hot",
      categoryId: hot.id,
      text: `${hot.name} is heading for ${input.formatRupees(Math.round(Number(hot.p50) * 100))}; you usually spend ${input.formatRupees(Math.round(Number(hot.baseline) * 100))}. Mostly weekend orders.`,
    });
  }
  if (input.unusual) {
    watch.push({
      id: input.idFor(321),
      kind: "unusual",
      transactionId: input.unusual.transactionId,
      text: `${input.formatRupees(input.unusual.cents)} at ${input.unusual.merchant} is about 3× your usual there.`,
    });
  }
  watch.push({
    id: input.idFor(322),
    kind: "subscription_candidate",
    payeeKey: "spotify",
    name: "Spotify",
    cadence: "monthly",
    amount: "119.00",
    text: "Spotify, ₹119 monthly. Track it as recurring?",
  });

  return {
    year,
    month,
    today: dayKey(today),
    timezone: input.timezone,
    mode: "full",
    historyDays: HISTORY_DAYS,
    landing: {
      p10: decimal(p10),
      p50: decimal(p50),
      p90: decimal(p90),
      budget: decimal(budgetCents),
      chanceUnder: 0.71,
      spentSoFar: decimal(spentCents),
      billsStillDue: decimal(0),
      flexibleRemaining: decimal(flexibleRemaining),
    },
    safeToday: {
      amount: decimal(safeCents),
      usualForWeekday: decimal(DAILY_FLEXIBLE_CENTS),
      weekday,
    },
    categories,
    upcoming,
    watch,
    summary: `On track: likely ${input.formatRupees(p50)} against ${input.formatRupees(budgetCents)}.${hot ? ` Watch ${hot.name} this weekend.` : ""}`,
    accuracy: { lastMonthErrorPct: 6 },
  };
}
