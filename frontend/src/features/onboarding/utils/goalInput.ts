import type { StoredGoal } from "@/lib/onboarding/goalStorage";

import type { OnboardingGoal } from "../types";

export const GOAL_OPTIONS: { goal: OnboardingGoal; label: string }[] = [
  { goal: "track", label: "Track spending" },
  { goal: "budget", label: "Stick to a budget" },
  { goal: "save", label: "Save for something" },
];

/** Digits only, at most this many (₹ 9,99,99,999 is far past any monthly budget). */
const MAX_BUDGET_DIGITS = 8;

/** What the amount field keeps while typing: digits only, capped. */
export function sanitizeBudgetInput(text: string): string {
  return text.replace(/\D/g, "").slice(0, MAX_BUDGET_DIGITS);
}

/** The monthly budget (₹) typed in the goal step, or null when empty or zero. */
export function parseBudgetInput(text: string): number | null {
  const digits = sanitizeBudgetInput(text);
  if (digits === "") {
    return null;
  }
  const amount = Number.parseInt(digits, 10);
  return amount > 0 ? amount : null;
}

/** The amount counts only for "Stick to a budget"; picking another goal drops it. */
export function budgetAmountForGoal(
  goal: OnboardingGoal | null,
  text: string,
): number | null {
  return goal === "budget" ? parseBudgetInput(text) : null;
}

/**
 * What the goal step hands over when the user continues: the goal to remember on the device and the
 * budget to save with it. Skipping (or no choice) stores nothing.
 */
export function resolveGoalSubmission(
  goal: OnboardingGoal | null,
  budgetText: string,
  skip: boolean,
): { stored: StoredGoal | null; budgetAmount: number | null } {
  if (skip || goal === null) {
    return { stored: null, budgetAmount: null };
  }
  const budgetAmount = budgetAmountForGoal(goal, budgetText);
  return {
    stored: { goal, ...(budgetAmount ? { budgetAmount } : {}) },
    budgetAmount,
  };
}
