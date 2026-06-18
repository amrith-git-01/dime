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
  rangePages: (userId: string | undefined, fromIso: string, toIso: string) =>
    [
      ...transactionsQueryKeys.all,
      "rangePages",
      userId ?? "none",
      fromIso,
      toIso,
    ] as const,
};
