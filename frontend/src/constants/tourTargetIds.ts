/**
 * Ids of the elements the guided app tours can spotlight. Each id is claimed by exactly one
 * `useTourTarget` / `<TourTarget>` in the UI; the tour steps (`features/appTour`) refer to them.
 */
export const tourTargetIds = {
  /** The shared tab header; the tour measures it to know where the scrollable area starts. */
  appHeader: "app.header",
  headerSettings: "header.settings",

  // Home
  homeMonthCard: "home.monthCard",
  homeStats: "home.stats",
  homeUpcoming: "home.upcoming",
  homeCategories: "home.categories",
  /** First row of Recent transactions: the tour asks the user to open it. */
  homeFirstTransaction: "home.firstTransaction",

  // Add menu
  addFab: "tabBar.addFab",
  fabMenu: "tabBar.fabMenu",
  /** The pencil (add by hand) bubble of the fanned-out add menu. */
  fabManual: "tabBar.fabManual",
  /** The mic (voice) bubble. */
  fabVoice: "tabBar.fabVoice",
  /** The camera (scan a receipt) bubble. */
  fabPhoto: "tabBar.fabPhoto",

  // Transactions
  transactionsCalendar: "transactions.calendar",
  transactionsMonthNav: "transactions.monthNav",
  transactionsDayHeader: "transactions.dayHeader",
  transactionsDayAdd: "transactions.dayAdd",
  transactionsFirstRow: "transactions.firstRow",
  transactionDetailCard: "transactionDetail.card",
  /** Subtitle row on top of a filtered transactions list (a day, payee or category). */
  transactionsListHeader: "transactionsList.header",

  // Budgets
  budgetsSummary: "budgets.summary",
  budgetsRecurring: "budgets.recurring",
  budgetsRecurringItem: "budgets.recurringItem",
  recurringEditorForm: "recurringEditor.form",
  budgetsCategoriesHeader: "budgets.categoriesHeader",
  budgetsFirstCategory: "budgets.firstCategory",

  // Insights
  insightsSummary: "insights.summary",
  insightsPace: "insights.pace",
  insightsCashflow: "insights.cashflow",
  insightsPayees: "insights.payees",
  insightsCompare: "insights.compare",
  insightsCompareSnapshot: "insights.compareSnapshot",

  // Ask AI
  agentFab: "agent.fab",
  agentPanel: "agent.panel",
  agentSuggestions: "agent.suggestions",
  agentAnswer: "agent.answer",
  agentComposer: "agent.composer",
} as const;

export type TourTargetId = (typeof tourTargetIds)[keyof typeof tourTargetIds];
