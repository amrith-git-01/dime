export const forecastQueryKeys = {
  all: ["forecast"] as const,
  /** Every month of one user's forecasts (the optimistic hide patches them all). */
  user: (userId: string | undefined) =>
    [...forecastQueryKeys.all, "month", userId ?? "none"] as const,
  month: (
    userId: string | undefined,
    year: number,
    month: number,
    timezone: string,
  ) =>
    [
      ...forecastQueryKeys.all,
      "month",
      userId ?? "none",
      year,
      month,
      timezone,
    ] as const,
};
