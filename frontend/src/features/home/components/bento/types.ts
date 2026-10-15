import type { CategorySpendRowData } from "@/components/categories/CategorySpendBentoRow";
import type { RecurringItem } from "@/features/recurring/types";
import type { TransactionRow } from "@/features/transactions/types";

export type HomeTopCategoryItem = CategorySpendRowData;

export type HomeBentoContentProps = {
  isError: boolean;
  isPending: boolean;

  // Month hero card
  monthLabel: string;
  /** Leftover this month — used in the hero subtitle when a budget exists. */
  monthlyRemainingDisplay: string;
  /** Formatted total spent this month — hero amount. */
  spentMonthDisplay: string;
  monthlyProgress: number;
  hasMonthlyBudget: boolean;
  /** "₹1.2k left of ₹5k" compact remaining/total — used as hero subtitle. */
  monthlySubtext: string;
  /** "Recurring ₹X · Flexible ₹Y" under the hero amount; null/absent when none of the spend is recurring. */
  monthSplitLine?: string | null;

  // Stat row
  netDisplay: string;
  netValue: number;
  incomeValue: number;
  spentMonthValue: number;
  /** Month credits — Income cell on MonthStatRow. */
  creditedDisplay: string;

  // Sections
  topCategories: HomeTopCategoryItem[];
  monthlyBudgetAmount: number;
  recentTransactions: TransactionRow[];
  showRecentEmpty: boolean;
  incomePending: boolean;

  // Upcoming recurring income / bills (next 30 days); empty hides the card
  upcomingItems: RecurringItem[];
  upcomingToday: Date;
  onUpcomingPress: (item: RecurringItem) => void;

  // Navigation
  onNavigateBudgets: () => void;
  onNavigateTransactions: () => void;
  onAddMonthlyBudget: () => void;
  onCategoryPress: (item: HomeTopCategoryItem) => void;
  onTransactionPress: (tx: TransactionRow) => void;
  onManualAdd: () => void;
  onReceipt: () => void;
  onVoice: () => void;

  // Unused in new design (kept for compat during migration)
  last7DaysSpend: { date: string; total: number }[];
  debitedDisplay: string;
};
