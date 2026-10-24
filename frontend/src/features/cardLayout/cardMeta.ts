import {
  ArrowLeftRight,
  CalendarClock,
  CalendarDays,
  ChartBarBig,
  GitCompareArrows,
  HandCoins,
  LayoutGrid,
  ListChecks,
  ReceiptText,
  Repeat,
  Target,
  TrendingUp,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react-native";

import type { CardId, CardScreen } from "./cardIds";

export type CardMeta = { name: string; icon: LucideIcon };

/** What a card is called, and drawn as, in the Arrange sheet. */
export const CARD_META: Record<CardId, CardMeta> = {
  "home.month": { name: "This month", icon: Wallet },
  "home.getStarted": { name: "Get started", icon: ListChecks },
  "home.stats": { name: "Month stats", icon: ArrowLeftRight },
  "home.upcoming": { name: "Upcoming", icon: CalendarClock },
  "home.categories": { name: "Top categories", icon: LayoutGrid },
  "home.recent": { name: "Recent transactions", icon: ReceiptText },

  "budgets.summary": { name: "Budget summary", icon: Target },
  "budgets.recurring": { name: "Recurring", icon: Repeat },
  "budgets.categories": { name: "Category budgets", icon: LayoutGrid },

  "insights.month": { name: "Month", icon: CalendarDays },
  "insights.summary": { name: "Summary", icon: Wallet },
  "insights.fixedCosts": { name: "Fixed costs", icon: Repeat },
  "insights.cashflow": { name: "Daily spending", icon: ChartBarBig },
  "insights.payees": { name: "Who you paid", icon: Users },
  "insights.income": { name: "Who paid you", icon: HandCoins },
  "insights.topExpenses": { name: "Top expenses", icon: TrendingUp },
  "insights.compare": { name: "Compare months", icon: GitCompareArrows },
};

export const CARD_SCREEN_TITLES: Record<CardScreen, string> = {
  home: "Arrange Home",
  budgets: "Arrange Budgets",
  insights: "Arrange Insights",
};
