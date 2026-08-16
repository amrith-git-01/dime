import type { CategorySpendRowData } from "@/components/categories/CategorySpendBentoRow";
import type { TransactionRow } from "@/features/transactions/types";

export type HomeTopCategoryItem = CategorySpendRowData;

export type HomeBentoContentProps = {
  isError: boolean;
  isPending: boolean;

  // Month hero card
  monthLabel: string;
  /** Formatted remaining budget (e.g. "₹24,996") — shown as hero if budget set. */
  monthlyRemainingDisplay: string;
  /** Formatted total spent (e.g. "₹4") — hero when no budget. */
  spentMonthDisplay: string;
  monthlyProgress: number;
  hasMonthlyBudget: boolean;
  /** "₹1.2k / ₹5k" compact remaining/total — used as hero subtitle. */
  monthlySubtext: string;

  // Daily cap strip
  spentTodayDisplay: string;
  dayLabel: string;
  dailySubtext: string;
  hasDailyBudget: boolean;
  /** 0–1 ratio of today's spend vs daily budget. */
  dailyProgress: number;

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

  // Navigation
  onNavigateBudgets: () => void;
  onNavigateTransactions: () => void;
  onAddMonthlyBudget: () => void;
  onAddDailyBudget: () => void;
  onCategoryPress: (item: HomeTopCategoryItem) => void;
  onTransactionPress: (tx: TransactionRow) => void;
  onManualAdd: () => void;
  onReceipt: () => void;
  onVoice: () => void;

  // Unused in new design (kept for compat during migration)
  last7DaysSpend: { date: string; total: number }[];
  debitedDisplay: string;
};
