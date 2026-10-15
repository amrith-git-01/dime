import { format } from "date-fns";

import type { WidgetSnapshot } from "@/lib/widgets/widgetSnapshotMmkv";
import { formatInrCompact } from "@/utils/currency";

import { maskAmount, safeHexColor } from "./widgetFormat";

const MAX_ROWS = 3;

export type CategoryBudgetRow = {
  id: string;
  name: string;
  /** The category's own colour, or null to use the accent. */
  color: string | null;
  /** "₹1,535 of ₹5,000", or just the spent amount without a cap. */
  amountText: string;
  /** 0..100. Against the cap when there is one, else against the largest category shown. */
  percent: number;
  overBudget: boolean;
};

/** What the Category budgets widget draws, already formatted. */
export type CategoryBudgetsModel = {
  signedOut: boolean;
  title: string;
  rows: CategoryBudgetRow[];
  /** Shown instead of rows: the sign-in prompt, a refresh hint, or no spending yet. */
  message: string | null;
  accessibilityLabel: string;
};

function percentOf(part: number, whole: number): number {
  if (part <= 0 || whole <= 0) {
    return 0;
  }
  return Math.min(100, Math.max(1, Math.round((part / whole) * 100)));
}

export function buildCategoryBudgetsModel(
  snapshot: WidgetSnapshot | null,
  now: Date = new Date(),
  hideAmounts: boolean = false,
): CategoryBudgetsModel {
  if (!snapshot) {
    return {
      signedOut: true,
      title: "Top categories",
      rows: [],
      message: "Sign in to Dime",
      accessibilityLabel: "Dime categories. Sign in to Dime. Opens the app.",
    };
  }
  // Category totals describe the month they were fetched in.
  if (snapshot.monthKey !== format(now, "yyyy-MM")) {
    return {
      signedOut: false,
      title: "Top categories",
      rows: [],
      message: "Open Dime to refresh",
      accessibilityLabel:
        "Dime categories. Open Dime to refresh. Opens the app.",
    };
  }

  const shown = snapshot.topCategories.slice(0, MAX_ROWS);
  const largest = Math.max(0, ...shown.map((category) => category.spent));
  const rows = shown.map((category) => {
    const cap = category.budget !== null && category.budget > 0 ? category.budget : null;
    const spent = maskAmount(formatInrCompact(category.spent), hideAmounts);
    return {
      id: category.id,
      name: category.name,
      color: safeHexColor(category.color),
      amountText:
        cap !== null
          ? `${spent} of ${maskAmount(formatInrCompact(cap), hideAmounts)}`
          : spent,
      percent: percentOf(category.spent, cap ?? largest),
      overBudget: cap !== null && category.spent > cap,
    };
  });

  return {
    signedOut: false,
    title: "Top categories",
    rows,
    message: rows.length === 0 ? "No spending yet this month" : null,
    accessibilityLabel:
      rows.length === 0
        ? "Dime categories. No spending yet this month. Opens budgets."
        : `Dime categories. ${rows
            .map((row) => `${row.name}, ${row.amountText}`)
            .join(". ")}. Opens budgets.`,
  };
}
