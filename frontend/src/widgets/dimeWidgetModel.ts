import { format } from "date-fns";

import { currentWidgetCaptureStatus } from "@/lib/widgets/widgetCaptureMmkv";
import type { WidgetSnapshot } from "@/lib/widgets/widgetSnapshotMmkv";
import {
  formatInrChartAxis,
  formatInrCompact,
  formatSpendMagnitude,
} from "@/utils/currency";

import { HIDDEN_AMOUNT, maskAmount, safeHexColor } from "./widgetFormat";

/** `full` has the categories column and the split line; `compact` is the short, month-and-buttons form. */
export type DimeWidgetLayout = "full" | "compact";

export type DimeWidgetCategoryRow = {
  id: string;
  name: string;
  /** The category's own colour, or null to use the accent. */
  color: string | null;
  /** Spent this month, short ("₹1,535"). */
  amountText: string;
  /** 0..100. Against the cap when there is one, else against the largest category shown. */
  percent: number;
  overBudget: boolean;
};

/** What the Dime widget draws, already formatted. Built from the snapshot and the capture status alone. */
export type DimeWidgetModel = {
  signedOut: boolean;
  title: string;
  /** Spent this month, or the sign-in prompt. */
  amount: string;
  /** "₹X left of ₹Y"; null without a budget. */
  budgetLine: string | null;
  /** Budget used, 0..100; null without a budget. */
  progressPercent: number | null;
  overBudget: boolean;
  /** "Recurring ₹15k · Flexible ₹3k"; null when nothing recurring was spent. */
  splitLine: string | null;
  /** Top categories this month; empty when stale, signed out or none yet. */
  categories: DimeWidgetCategoryRow[];
  hint: string | null;
  /** The last capture's result ("Added ₹250 · Swiggy"), while it is fresh. */
  status: { kind: "reading" | "added" | "failed"; text: string } | null;
  accessibilityLabel: string;
};

const NO_AMOUNT = "₹—";
const MAX_CATEGORIES = 3;
/** Below this the categories column and the split line are dropped (about 3 launcher rows and up fit them). */
const FULL_LAYOUT_MIN_HEIGHT_DP = 170;
/** The two columns need room: a narrower widget keeps the month column only. */
const CATEGORIES_MIN_WIDTH_DP = 270;

/** Unknown size (0) counts as full. */
export function dimeWidgetLayout(heightDp: number): DimeWidgetLayout {
  return heightDp > 0 && heightDp < FULL_LAYOUT_MIN_HEIGHT_DP ? "compact" : "full";
}

export function dimeWidgetShowsCategories(widthDp: number): boolean {
  return widthDp <= 0 || widthDp >= CATEGORIES_MIN_WIDTH_DP;
}

function percentOf(part: number, whole: number): number {
  if (part <= 0 || whole <= 0) {
    return 0;
  }
  return Math.min(100, Math.max(1, Math.round((part / whole) * 100)));
}

/** The status line carries an amount ("Added ₹250 · Swiggy"); with hidden amounts it must not. */
function maskStatus(text: string, hideAmounts: boolean): string {
  return hideAmounts ? text.replace(/₹\s?[\d,.]+/g, HIDDEN_AMOUNT) : text;
}

export function buildDimeWidgetModel(
  snapshot: WidgetSnapshot | null,
  now: Date = new Date(),
  hideAmounts: boolean = false,
): DimeWidgetModel {
  if (!snapshot) {
    return {
      signedOut: true,
      title: "Dime",
      amount: "Sign in to Dime",
      budgetLine: null,
      progressPercent: null,
      overBudget: false,
      splitLine: null,
      categories: [],
      hint: "Tap to open the app",
      status: null,
      accessibilityLabel: "Dime. Sign in to Dime. Opens the app.",
    };
  }

  const captureStatus = currentWidgetCaptureStatus(snapshot.userId, now.getTime());
  const status = captureStatus
    ? { kind: captureStatus.kind, text: maskStatus(captureStatus.text, hideAmounts) }
    : null;

  // Totals describe the month they were fetched in; a snapshot from last month is not "this month".
  if (snapshot.monthKey !== format(now, "yyyy-MM")) {
    return {
      signedOut: false,
      title: "This month",
      amount: NO_AMOUNT,
      budgetLine: null,
      progressPercent: null,
      overBudget: false,
      splitLine: null,
      categories: [],
      hint: "Open Dime to refresh",
      status,
      accessibilityLabel: "Dime this month. Open Dime to refresh. Opens the app.",
    };
  }

  const money = (rupees: number, formatter: (value: number) => string) =>
    maskAmount(formatter(rupees), hideAmounts);
  const amount = money(snapshot.spentThisMonth, formatSpendMagnitude);
  const hasBudget =
    snapshot.monthlyBudget !== null &&
    snapshot.monthlyBudget > 0 &&
    snapshot.budgetLeft !== null;
  const budgetLine = hasBudget
    ? `${money(snapshot.budgetLeft!, formatInrCompact)} left of ${money(snapshot.monthlyBudget!, formatInrCompact)}`
    : null;
  const progressPercent = hasBudget
    ? Math.min(
        100,
        Math.max(
          snapshot.spentThisMonth > 0 ? 1 : 0,
          Math.round((snapshot.spentThisMonth / snapshot.monthlyBudget!) * 100),
        ),
      )
    : null;
  const splitLine =
    snapshot.recurringSpent > 0
      ? `Recurring ${money(snapshot.recurringSpent, formatInrChartAxis)} · Flexible ${money(snapshot.flexibleSpent, formatInrChartAxis)}`
      : null;

  const shown = snapshot.topCategories.slice(0, MAX_CATEGORIES);
  const largest = Math.max(0, ...shown.map((category) => category.spent));
  const categories = shown.map((category) => {
    const cap = category.budget !== null && category.budget > 0 ? category.budget : null;
    return {
      id: category.id,
      name: category.name,
      color: safeHexColor(category.color),
      amountText: money(category.spent, formatInrCompact),
      percent: percentOf(category.spent, cap ?? largest),
      overBudget: cap !== null && category.spent > cap,
    };
  });

  return {
    signedOut: false,
    title: "This month",
    amount,
    budgetLine,
    progressPercent,
    overBudget: hasBudget && snapshot.spentThisMonth >= snapshot.monthlyBudget!,
    splitLine,
    categories,
    hint: null,
    status,
    accessibilityLabel: [
      `Dime this month. Spent ${amount}.`,
      budgetLine ? `${budgetLine}.` : null,
      status ? `${status.text}.` : null,
      "Opens Dime.",
    ]
      .filter(Boolean)
      .join(" "),
  };
}
