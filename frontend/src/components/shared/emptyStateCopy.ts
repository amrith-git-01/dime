/** Shared empty-state copy — keep headlines/subtext consistent app-wide. */
export const emptyStateCopy = {
  homeCategories: {
    headline: "No spending yet",
    subtext: "Categories will show up here once you log an expense.",
  },
  homeRecent: {
    headline: "Tap + or just say it",
    subtext:
      "Add what you spent by hand, or tap the mic and say “250 for lunch”.",
    actionLabel: "Add expense",
    secondaryActionLabel: "Say it",
  },
  transactionsDay: {
    headline: "Nothing on this day",
    subtext: "Try another day, or add one below.",
    actionLabel: "Add expense",
  },
  transactionsDayFuture: {
    headline: "Nothing on this day",
    subtext: "This day hasn't came yet - try another date.",
  },
  budgetCategories: {
    headline: "No categories yet",
    subtext: "Sync transactions to see spending by category.",
  },
  notificationsInbox: {
    headline: "No notifications yet",
    subtext: "Capture and budget alerts will show up here.",
  },
  notificationsError: {
    headline: "Could not load notifications",
    subtext: "Check your connection and pull to refresh from the tab bar.",
  },
  transactionsListError: {
    headline: "Could not load transactions",
    subtext: "Check your connection and try again.",
  },
  transactionsListDay: {
    headline: "No transactions on this day",
    subtext: "Nothing was recorded for this date in the selected month.",
  },
  transactionsListCategory: {
    headline: "No transactions in this category",
    subtext: "No debits were recorded in this category for the selected month.",
  },
  transactionsListCategoryRange: {
    headline: "No transactions in this category",
    subtext:
      "No debits were recorded in this category for the selected period.",
  },
  transactionsListPayee: {
    headline: "No transactions for this payee",
    subtext: "No debits matched this payee in the selected month.",
  },
  transactionsListPayeeRange: {
    headline: "No transactions for this payee",
    subtext: "No debits matched this payee in the selected period.",
  },
  analyticsCategoryBreakdown: {
    headline: "No category data yet",
    subtext: "Spending by payee will appear once you log expenses.",
  },
  analyticsIncomeSources: {
    headline: "No income recorded",
    subtext: "Income sources will show up when credits are logged.",
  },
  analyticsTopExpenses: {
    headline: "No expenses yet",
    subtext: "Your largest debits this month will appear here.",
    actionLabel: "Add expense",
  },
  analyticsCounterparty: {
    headline: "No payee data yet",
    subtext: "See where your money went once you log expenses.",
  },
  comparePayees: {
    headline: "No payees this month",
    subtext: "Spending breakdown appears when debits are logged.",
  },
} as const;
