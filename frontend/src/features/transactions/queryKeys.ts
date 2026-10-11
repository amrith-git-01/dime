export const transactionsQueryKeys = {
  all: ["transactions"] as const,
  detail: (userId: string | undefined, transactionId: string) =>
    [
      ...transactionsQueryKeys.all,
      "detail",
      userId ?? "none",
      transactionId,
    ] as const,
  home: (userId: string | undefined, timezone: string) =>
    [...transactionsQueryKeys.all, "home", userId ?? "none", timezone] as const,
  monthSummary: (
    userId: string | undefined,
    year: number,
    month: number,
    timezone: string,
  ) =>
    [
      ...transactionsQueryKeys.all,
      "monthSummary",
      userId ?? "none",
      year,
      month,
      timezone,
    ] as const,
  monthPages: (
    userId: string | undefined,
    year: number,
    month: number,
    timezone: string,
  ) =>
    [
      ...transactionsQueryKeys.all,
      "monthPages",
      userId ?? "none",
      year,
      month,
      timezone,
    ] as const,
  /**
   * Month list narrowed by server-side payee/category filters. Kept apart from `monthPages`
   * so realtime patches (which assume an unfiltered month) never touch it.
   */
  filteredMonthPages: (
    userId: string | undefined,
    year: number,
    month: number,
    timezone: string,
    filters: { payee?: string; categoryId?: string },
  ) =>
    [
      ...transactionsQueryKeys.all,
      "filteredMonthPages",
      userId ?? "none",
      year,
      month,
      timezone,
      filters.payee ?? "",
      filters.categoryId ?? "",
    ] as const,
  rangePages: (
    userId: string | undefined,
    fromIso: string,
    toIso: string,
    filters?: { payee?: string; categoryId?: string },
  ) =>
    [
      ...transactionsQueryKeys.all,
      "rangePages",
      userId ?? "none",
      fromIso,
      toIso,
      filters?.payee ?? "",
      filters?.categoryId ?? "",
    ] as const,
};
