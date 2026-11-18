import {
  pendingTotals,
  type PendingTransactionRow,
} from "@/features/outbox/utils/pendingMerge";
import type { MonthBudgetPicture } from "@/features/transactions/types";
import { toPaise } from "@/utils/paise";

/**
 * The month's budget numbers as every surface shows them: Home, the Android widget, Budgets, Insights and the
 * month compare. They all come from here, and here they only READ what the server computed (`budget_spent`,
 * `budget_left`, `committed_total`, `monthly_budget`: the one ledger definition) and lay the entries still waiting
 * in the outbox over it. No surface works out "spent" or "left" itself.
 *
 * Money is rupees (numbers) for display; every sum is done in integer paise first.
 */
export type MonthBudget = {
  /** The month has a cap (a past month keeps the cap it had then). */
  hasBudget: boolean;
  /** The cap in rupees; 0 when none. */
  budget: number;
  /** Spend that counts toward the budget (flexible spend plus recurring items that opted in), net of paybacks. */
  spent: number;
  /** Budget minus spent, SIGNED: negative means over budget (never clamped to 0). Null without a cap. */
  left: number | null;
  /** How far over the cap; 0 when within it or without one. */
  overBy: number;
  isOver: boolean;
  /** Spent as a share of the cap, 0..1 (a bar fill); 0 without a cap. */
  usedFraction: number;
  /** Whole percent of the cap spent, uncapped (can exceed 100); 0 without a cap. */
  usedPercent: number;
  /** Fixed spend outside the budget (rent, EMI, insurance). */
  committed: number;
  /** The budget spend split for the bar: recurring items that count toward it, and everything else. */
  recurringInBudget: number;
  flexibleInBudget: number;
};

export type MonthBudgetOptions = {
  /** Entries waiting in the outbox that fall in this month (pass `pendingInMonth(...)` / `usePendingInMonth(...)`). */
  pending?: readonly PendingTransactionRow[];
  /** The month's whole fixed (recurring) spend as an API decimal string, for the recurring / flexible split. */
  fixedSpend?: string | null;
};

const EMPTY: MonthBudget = {
  hasBudget: false,
  budget: 0,
  spent: 0,
  left: null,
  overBy: 0,
  isOver: false,
  usedFraction: 0,
  usedPercent: 0,
  committed: 0,
  recurringInBudget: 0,
  flexibleInBudget: 0,
};

/** The month's budget numbers from the server's picture plus the outbox overlay (see `MonthBudget`). */
export function resolveMonthBudget(
  picture: MonthBudgetPicture | undefined,
  options: MonthBudgetOptions = {},
): MonthBudget {
  if (!picture) {
    return EMPTY;
  }
  const overlayPaise = options.pending ? pendingTotals(options.pending).debitPaise : 0;
  const budgetPaise = toPaise(picture.monthly_budget);
  const hasBudget = budgetPaise > 0;
  const spentPaise = toPaise(picture.budget_spent) + overlayPaise;
  const committedPaise = toPaise(picture.committed_total);
  // The server's signed `budget_left`, less what is waiting: never recomputed from the cap.
  const leftPaise =
    hasBudget && picture.budget_left != null
      ? toPaise(picture.budget_left) - overlayPaise
      : null;
  const recurringPaise = Math.min(
    spentPaise,
    Math.max(0, toPaise(options.fixedSpend) - committedPaise),
  );

  return {
    hasBudget,
    budget: budgetPaise / 100,
    spent: spentPaise / 100,
    left: leftPaise === null ? null : leftPaise / 100,
    overBy: leftPaise !== null && leftPaise < 0 ? -leftPaise / 100 : 0,
    isOver: leftPaise !== null && leftPaise < 0,
    usedFraction: hasBudget ? Math.min(1, Math.max(0, spentPaise / budgetPaise)) : 0,
    usedPercent: hasBudget ? Math.max(0, Math.round((spentPaise / budgetPaise) * 100)) : 0,
    committed: committedPaise / 100,
    recurringInBudget: recurringPaise / 100,
    flexibleInBudget: (spentPaise - recurringPaise) / 100,
  };
}
