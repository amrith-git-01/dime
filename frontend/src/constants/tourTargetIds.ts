/**
 * Ids of the elements the guided app tour can spotlight. Each id is claimed by exactly one
 * `useTourTarget` / `<TourTarget>` in the UI; the tour steps (`features/appTour`) refer to them.
 */
export const tourTargetIds = {
  homeMonthCard: "home.monthCard",
  addFab: "tabBar.addFab",
  fabMenu: "tabBar.fabMenu",
  /** The pencil (add by hand) bubble of the fanned-out add menu. */
  fabManual: "tabBar.fabManual",
  agentFab: "agent.fab",
  transactionsDayAdd: "transactions.dayAdd",
  budgetsRecurring: "budgets.recurring",
  insightsSummary: "insights.summary",
  headerSettings: "header.settings",
} as const;

export type TourTargetId = (typeof tourTargetIds)[keyof typeof tourTargetIds];
