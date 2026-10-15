import { format } from "date-fns";

import type { WidgetSnapshot } from "@/lib/widgets/widgetSnapshotMmkv";
import { formatInrCompact, formatSpendMagnitude } from "@/utils/currency";

import { maskAmount } from "./widgetFormat";

const NO_AMOUNT = "₹—";
const MAX_ROWS = 2;

export type TodayRow = {
  id: string;
  name: string;
  /** "₹ 250", "+₹ 1,000" for money in; the hidden placeholder when amounts are hidden. */
  amount: string;
  credit: boolean;
};

/** What the Today widget draws, already formatted. Built from the snapshot alone. */
export type TodayModel = {
  signedOut: boolean;
  title: string;
  /** Spent today, or the sign-in prompt, or a dash when the snapshot is from another day. */
  amount: string;
  rows: TodayRow[];
  /** A line under the amount: how to refresh, or that nothing was spent yet. */
  hint: string | null;
  accessibilityLabel: string;
};

function isToday(isoTime: string, now: Date): boolean {
  const at = new Date(isoTime);
  return (
    !Number.isNaN(at.getTime()) &&
    format(at, "yyyy-MM-dd") === format(now, "yyyy-MM-dd")
  );
}

export function buildTodayModel(
  snapshot: WidgetSnapshot | null,
  now: Date = new Date(),
  hideAmounts: boolean = false,
): TodayModel {
  if (!snapshot) {
    return {
      signedOut: true,
      title: "Today",
      amount: "Sign in to Dime",
      rows: [],
      hint: "Tap to open the app",
      accessibilityLabel: "Dime today. Sign in to Dime. Opens the app.",
    };
  }

  const rows = snapshot.recentTransactions
    .filter((tx) => isToday(tx.at, now))
    .slice(0, MAX_ROWS)
    .map((tx) => ({
      id: tx.id,
      name: tx.name,
      amount: maskAmount(
        `${tx.type === "credit" ? "+" : ""}${formatInrCompact(tx.amount)}`,
        hideAmounts,
      ),
      credit: tx.type === "credit",
    }));

  // The total describes the day it was fetched; yesterday's is not "today".
  const fresh = snapshot.dayKey === format(now, "yyyy-MM-dd");
  const amount = fresh
    ? maskAmount(formatSpendMagnitude(snapshot.spentToday), hideAmounts)
    : NO_AMOUNT;
  const hint = !fresh
    ? "Open Dime"
    : rows.length === 0
      ? "Nothing spent yet"
      : null;

  return {
    signedOut: false,
    title: "Today",
    amount,
    rows,
    hint,
    accessibilityLabel: [
      `Dime today. Spent ${amount}.`,
      fresh ? null : "Open Dime to refresh.",
      "Opens Dime.",
    ]
      .filter(Boolean)
      .join(" "),
  };
}
