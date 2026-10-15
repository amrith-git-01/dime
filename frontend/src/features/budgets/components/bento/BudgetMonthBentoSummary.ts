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
  /** "Recurring ₹X · Flexible ₹Y"; null when none of the month's spend is recurring. */
  splitLine?: string | null;
  /** "₹Z recurring still to come"; null when nothing recurring is left this month. */
  upcomingLine?: string | null;
};
