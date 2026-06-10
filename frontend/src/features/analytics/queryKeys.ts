export const insightsQueryKeys = {
  all: ["insights"] as const,
  month: (
    userId: string | undefined,
    year: number,
    month: number,
    timezone: string,
  ) =>
    [
      ...insightsQueryKeys.all,
      "month",
      userId ?? "none",
      year,
      month,
      timezone,
    ] as const,
};
