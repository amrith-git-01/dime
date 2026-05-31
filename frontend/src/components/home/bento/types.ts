import type { TransactionRow } from "@/features/transactions/types";
import type { BentoCategoryItem } from "./BentoCategoryTile";

export type HomeCategoryBentoItem = BentoCategoryItem;

export type HomeBentoContentProps = {
  isError: boolean;
  isPending: boolean;
  spentTodayDisplay: string;
  spentMonthDisplay: string;
  dayLabel: string;
  monthLabel: string;
  dailySubtext: string;
  monthlySubtext: string;
  monthlyProgress: number;
  hasMonthlyBudget: boolean;
  hasDailyBudget: boolean;
  last7DaysSpend: { date: string; total: number }[];
  creditedDisplay: string;
  debitedDisplay: string;
  netDisplay: string;
  netValue: number;
  incomePending: boolean;
  topCategories: HomeCategoryBentoItem[];
  showCategoryProgress: boolean;
  recentTransactions: TransactionRow[];
  showRecentEmpty: boolean;
  onNavigateBudgets: () => void;
  onAddMonthlyBudget: () => void;
  onAddDailyBudget: () => void;
  onNavigateTransactions: () => void;
  onTransactionPress: (tx: TransactionRow) => void;
  /** Quick-add actions for section action bars */
  onManualAdd: () => void;
  onReceipt: () => void;
  onVoice: () => void;
};
