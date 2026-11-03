export type BudgetMonthBentoSummary = {
  budgetDisplay: string;
  spentDisplay: string;
  remainingDisplay: string;
  spentValue: number;
  budgetValue: number;
  remainingValue: number;
  isOverBudget: boolean;
  overageDisplay: string;
  usagePct: number;
  /** Whole percent of budget spent (uncapped — can exceed 100). */
  usagePercentUsed: number;
  usageLabel: string;
  /** Recurring spend this month, in rupees; the split bar is hidden when 0 or absent. */
  fixedSpent?: number;
  /** Flexible spend this month, in rupees. */
  flexibleSpent?: number;
  /** Recurring still to come this month, in rupees; 0 or absent when nothing recurring is left. */
  upcomingRecurring?: number;
};
