import type { RecurringOccurrence } from "@/features/recurring/types";
import { toPaise } from "@/utils/paise";

/** One fixed expense (rent, a subscription) planned or already paid this month. */
export type FixedPlanItem = {
  /** Day of the month it falls due (1-31). */
  day: number;
  /** Rupees: the amount that was posted for a paid item, the item's amount for an upcoming one. */
  amount: number;
  paid: boolean;
};

/** Day of month from a `YYYY-MM-DD` due date; 1 when malformed. */
function dueDay(dueDate: string): number {
  const day = Number.parseInt(dueDate.slice(8, 10), 10);
  return Number.isFinite(day) && day >= 1 ? day : 1;
}

/**
 * This month's fixed EXPENSES that count towards the plan: paid and upcoming recurring expenses.
 * Skipped occurrences and recurring income are not part of it.
 */
export function fixedPlanFromOccurrences(
  items: readonly RecurringOccurrence[] | undefined,
): FixedPlanItem[] {
  const plan: FixedPlanItem[] = [];
  for (const item of items ?? []) {
    if (item.kind !== "subscription") continue;
    if (item.status === "paid") {
      plan.push({
        day: dueDay(item.due_date),
        amount: toPaise(item.posted_amount ?? item.amount) / 100,
        paid: true,
      });
    } else if (item.status === "upcoming") {
      plan.push({
        day: dueDay(item.due_date),
        amount: toPaise(item.amount) / 100,
        paid: false,
      });
    }
  }
  return plan;
}

/** Sum of plan amounts in integer paise (exact). */
export function fixedPlanPaise(
  items: readonly FixedPlanItem[],
  filter: (item: FixedPlanItem) => boolean = () => true,
): number {
  let total = 0;
  for (const item of items) {
    if (filter(item)) total += Math.round(item.amount * 100);
  }
  return total;
}
