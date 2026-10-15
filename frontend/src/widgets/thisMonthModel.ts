import { format } from "date-fns";

import type { WidgetSnapshot } from "@/lib/widgets/widgetSnapshotMmkv";
import { formatInrCompact, formatSpendMagnitude } from "@/utils/currency";

export type ThisMonthLayout = "full" | "compact";

/** What the This month widget draws, already formatted. Built from the snapshot alone. */
export type ThisMonthModel = {
  signedOut: boolean;
  title: string;
  /** Spent this month, or the sign-in prompt. */
  amount: string;
  /** "₹X left of ₹Y"; null without a budget. */
  budgetLine: string | null;
  /** Budget used, 0..100; null without a budget. */
  progressPercent: number | null;
  overBudget: boolean;
  /** "Recurring ₹X · Flexible ₹Y"; null when nothing recurring was spent. */
  splitLine: string | null;
  hint: string | null;
  accessibilityLabel: string;
};

const NO_AMOUNT = "₹—";

/** A 4x1 widget is ~70dp tall, a 2x2 one 110dp or more. Unknown height (0) counts as full. */
export function thisMonthLayout(heightDp: number): ThisMonthLayout {
  return heightDp > 0 && heightDp < 100 ? "compact" : "full";
}

/** The extra split line only fits on taller (3 row) widgets. */
export function thisMonthShowsSplit(heightDp: number): boolean {
  return heightDp <= 0 || heightDp >= 130;
}

export function buildThisMonthModel(
  snapshot: WidgetSnapshot | null,
  now: Date = new Date(),
): ThisMonthModel {
  if (!snapshot) {
    return {
      signedOut: true,
      title: "Dime",
      amount: "Sign in to Dime",
      budgetLine: null,
      progressPercent: null,
      overBudget: false,
      splitLine: null,
      hint: "Tap to open the app",
      accessibilityLabel: "Dime. Sign in to Dime. Opens the app.",
    };
  }

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
      hint: "Open Dime to refresh",
      accessibilityLabel: "Dime this month. Open Dime to refresh. Opens the app.",
    };
  }

  const amount = formatSpendMagnitude(snapshot.spentThisMonth);
  const hasBudget =
    snapshot.monthlyBudget !== null &&
    snapshot.monthlyBudget > 0 &&
    snapshot.budgetLeft !== null;
  const budgetLine = hasBudget
    ? `${formatInrCompact(snapshot.budgetLeft!)} left of ${formatInrCompact(snapshot.monthlyBudget!)}`
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
      ? `Recurring ${formatInrCompact(snapshot.recurringSpent)} · Flexible ${formatInrCompact(snapshot.flexibleSpent)}`
      : null;

  return {
    signedOut: false,
    title: "This month",
    amount,
    budgetLine,
    progressPercent,
    overBudget: hasBudget && snapshot.spentThisMonth >= snapshot.monthlyBudget!,
    splitLine,
    hint: null,
    accessibilityLabel: [
      `Dime this month. Spent ${amount}.`,
      budgetLine ? `${budgetLine}.` : null,
      "Opens Dime.",
    ]
      .filter(Boolean)
      .join(" "),
  };
}
