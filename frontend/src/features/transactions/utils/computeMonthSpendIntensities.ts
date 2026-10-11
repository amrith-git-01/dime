export type SpendIntensity = "none" | "low" | "medium" | "high";

/** Rank spend days within the month into tertiles so heat spreads beyond max-ratio. */
export function computeMonthSpendIntensities(
  spendByDay: Record<string, number>,
  year: number,
  monthIndex0: number,
): Record<string, SpendIntensity> {
  const monthPrefix = `${year}-${String(monthIndex0 + 1).padStart(2, "0")}`;

  const activeDays = Object.entries(spendByDay)
    .filter(([dayKey, spend]) => dayKey.startsWith(monthPrefix) && spend > 0)
    .sort(([, a], [, b]) => a - b);

  if (activeDays.length === 0) {
    return {};
  }

  const result: Record<string, SpendIntensity> = {};
  const count = activeDays.length;

  activeDays.forEach(([dayKey], index) => {
    if (count === 1) {
      result[dayKey] = "medium";
      return;
    }
    if (count === 2) {
      result[dayKey] = index === 0 ? "low" : "high";
      return;
    }

    const rank = index / (count - 1);
    if (rank < 1 / 3) {
      result[dayKey] = "low";
    } else if (rank < 2 / 3) {
      result[dayKey] = "medium";
    } else {
      result[dayKey] = "high";
    }
  });

  return result;
}
