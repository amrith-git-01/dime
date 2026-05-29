import type { TransactionRow } from "@/features/transactions/types";

export type HomeCategoryBentoItem = {
  id: string;
  label: string;
  icon_name: string;
  amount: string;
  /** 0..1 — fraction of monthly total */
  progress: number;
  /** Full-saturation category primary hex */
  color: string;
};

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
  showMonthlyRing: boolean;
  hasBudget: boolean;
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
  onNavigateTransactions: () => void;
  onTransactionPress: (tx: TransactionRow) => void;
  /** Quick-add actions for section action bars */
  onManualAdd: () => void;
  onReceipt: () => void;
  onVoice: () => void;
};
