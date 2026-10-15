import { format } from "date-fns";

import { toPaise, paiseToRupees } from "@/utils/paise";

import { updateWidgetSnapshot } from "./widgetSnapshotMmkv";

const MAX_RECENT = 5;

export type OptimisticSpend = {
  /** The account that made the tap; another account's snapshot is never touched. */
  userId: string;
  /** The transaction's id, or the outbox key until the server's id is known. */
  id: string;
  name: string;
  /** Rupees. */
  amount: number;
  /** Epoch ms of the tap: its day and month decide which totals it belongs to. */
  at: number;
};

function round(value: number): number {
  return paiseToRupees(Math.max(0, toPaise(value)));
}

/**
 * Makes the stored snapshot include (or, for an undo, exclude) a flexible expense the widgets just
 * sent, so every widget shows it at once instead of after the app's next refetch. The app's own
 * snapshot writer overwrites this with the server's numbers the next time it syncs. The month
 * totals change only when the tap's month is the snapshot's month, today's total only when its
 * day is the snapshot's day. Returns whether anything changed.
 */
export function bumpWidgetSnapshot(
  spend: OptimisticSpend,
  direction: "add" | "remove",
): boolean {
  const sign = direction === "add" ? 1 : -1;
  const tapped = new Date(spend.at);
  return updateWidgetSnapshot((snapshot) => {
    if (snapshot.userId !== spend.userId) {
      return snapshot;
    }
    const sameMonth = snapshot.monthKey === format(tapped, "yyyy-MM");
    const sameDay = snapshot.dayKey === format(tapped, "yyyy-MM-dd");
    if (!sameMonth && !sameDay) {
      return snapshot;
    }
    const next = { ...snapshot };
    if (sameMonth) {
      next.spentThisMonth = round(snapshot.spentThisMonth + sign * spend.amount);
      next.flexibleSpent = round(snapshot.flexibleSpent + sign * spend.amount);
      if (snapshot.monthlyBudget !== null) {
        next.budgetLeft = round(snapshot.monthlyBudget - next.spentThisMonth);
      }
      next.recentTransactions =
        direction === "add"
          ? [
              {
                id: spend.id,
                name: spend.name,
                amount: spend.amount,
                type: "debit" as const,
                at: tapped.toISOString(),
              },
              ...snapshot.recentTransactions.filter((tx) => tx.id !== spend.id),
            ].slice(0, MAX_RECENT)
          : snapshot.recentTransactions.filter((tx) => tx.id !== spend.id);
    }
    if (sameDay) {
      next.spentToday = round(snapshot.spentToday + sign * spend.amount);
    }
    return next;
  });
}
