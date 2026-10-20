import type { ChecklistItemId, OnboardingGoal } from "../types";

/** Rows of the "Get started" card, in the default order. */
export const CHECKLIST_ITEM_IDS: readonly ChecklistItemId[] = [
  "firstExpense",
  "voiceOrScan",
  "budget",
  "recurring",
  "widget",
  "askAi",
];

export const CHECKLIST_ITEM_COUNT = CHECKLIST_ITEM_IDS.length;

export const CHECKLIST_ITEM_LABELS: Record<ChecklistItemId, string> = {
  firstExpense: "Log your first expense",
  voiceOrScan: "Try voice or scan",
  budget: "Set a monthly budget",
  recurring: "Add a recurring bill or income",
  widget: "Add the home-screen widget",
  askAi: "Ask Dime AI a question",
};

/** Row hint shown under the label until the item is done. */
export const CHECKLIST_ITEM_HINTS: Record<ChecklistItemId, string> = {
  firstExpense: "Tap + and add what you spent",
  voiceOrScan: "Say it or snap a receipt",
  budget: "See how much is left each month",
  recurring: "Rent, SIPs and salary, once",
  widget: "Add an expense from your home screen",
  askAi: "Ask about your spending in plain words",
};

/** Which item a goal moves up to second place (the first expense always leads). */
export const GOAL_PRIORITY_ITEM: Partial<Record<OnboardingGoal, ChecklistItemId>> = {
  budget: "budget",
  save: "recurring",
};
