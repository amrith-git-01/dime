import {
  formatDueDate,
  selectUpcoming,
} from "@/features/recurring/utils/recurringDisplay";
import type { WidgetSnapshot } from "@/lib/widgets/widgetSnapshotMmkv";
import { formatInrCompact } from "@/utils/currency";

import { maskAmount } from "./widgetFormat";

const MAX_ROWS = 3;

export type UpcomingRow = {
  id: string;
  name: string;
  /** "Today", "Tomorrow", "In 3 days", "1 Nov". */
  due: string;
  /** "+₹ 50,000" for income; plain for bills; the hidden placeholder when amounts are hidden. */
  amount: string;
  income: boolean;
};

/** What the Upcoming recurring widget draws, already formatted. */
export type UpcomingModel = {
  signedOut: boolean;
  title: string;
  rows: UpcomingRow[];
  /** Shown instead of rows: the sign-in prompt, or nothing due. */
  message: string | null;
  accessibilityLabel: string;
};

/** "Due today" -> "Today", "Due 1 Nov" -> "1 Nov": the widget already says what these are. */
function dueLabel(isoDate: string, now: Date): string {
  const text = formatDueDate(isoDate, now).replace(/^Due /, "");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function buildUpcomingModel(
  snapshot: WidgetSnapshot | null,
  now: Date = new Date(),
  hideAmounts: boolean = false,
): UpcomingModel {
  if (!snapshot) {
    return {
      signedOut: true,
      title: "Upcoming",
      rows: [],
      message: "Sign in to Dime",
      accessibilityLabel:
        "Dime upcoming recurring. Sign in to Dime. Opens the app.",
    };
  }

  // The snapshot keeps active items only; due dates are judged at draw time against today.
  const rows = selectUpcoming(
    snapshot.recurring.map((item) => ({
      ...item,
      active: true,
      next_due_date: item.nextDueDate,
    })),
    now,
    undefined,
    MAX_ROWS,
  ).map((item) => ({
    id: item.id,
    name: item.name,
    due: dueLabel(item.nextDueDate, now),
    amount: maskAmount(
      `${item.kind === "income" ? "+" : ""}${formatInrCompact(item.amount)}`,
      hideAmounts,
    ),
    income: item.kind === "income",
  }));

  return {
    signedOut: false,
    title: "Upcoming",
    rows,
    message: rows.length === 0 ? "No recurring due in the next 30 days" : null,
    accessibilityLabel:
      rows.length === 0
        ? "Dime upcoming recurring. Nothing due in the next 30 days. Opens recurring."
        : `Dime upcoming recurring. ${rows
            .map((row) => `${row.name}, ${row.due}, ${row.amount}`)
            .join(". ")}. Opens recurring.`,
  };
}
