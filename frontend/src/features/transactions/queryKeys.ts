export const transactionsQueryKeys = {
  all: ["transactions"] as const,
  list: (userId: string | undefined) =>
    [...transactionsQueryKeys.all, "list", userId ?? "none"] as const,
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
  /** Aggregated debit totals per `category_id` (key `"__uncategorized__"` when null). */
  monthCategoryDebits: (
    userId: string | undefined,
    year: number,
    calendarMonth: number,
    timezone: string,
  ) =>
    [
      ...transactionsQueryKeys.all,
      "monthCategoryDebits",
      userId ?? "none",
      year,
      calendarMonth,
      timezone,
    ] as const,
};
