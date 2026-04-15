import { budgetRowHeight } from "@/constants/dimensions";

/** Uniform row height when monthly budget exists (icon row + progress track). */
export const BUDGET_ROW_HEIGHT_WITH_PROGRESS = budgetRowHeight.withProgress;

/** Uniform row height when no monthly budget (spent only). */
export const BUDGET_ROW_HEIGHT_SPENT_ONLY = budgetRowHeight.spentOnly;
