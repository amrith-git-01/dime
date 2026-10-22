import { memo } from "react";
import { Text, View } from "react-native";

import { spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { InsightsCard } from "@/features/analytics/components/InsightsCard";
import { createThemedStyles } from "@/theme";
import { formatInrCompact } from "@/utils/currency";

import type { ForecastSafeToday } from "../types";
import { toRupees, weekdayName } from "../utils/forecastFormat";

type SafeToSpendCardProps = {
  safeToday: ForecastSafeToday;
};

/**
 * What is safe to spend today within the budget; without a budget, what a day like today
 * usually costs.
 */
export const SafeToSpendCard = memo(function SafeToSpendCard({
  safeToday,
}: SafeToSpendCardProps) {
  const styles = useStyles();
  const weekday = weekdayName(safeToday.weekday);
  const usual = formatInrCompact(safeToday.usualForWeekday);

  if (safeToday.amount === null) {
    const line = `Usual for a ${weekday}: ${usual}`;
    return (
      <InsightsCard
        kicker="SAFE TO SPEND TODAY"
        subtitle="Set a monthly budget to see a daily limit"
      >
        <View style={styles.body} accessible accessibilityLabel={line}>
          <Text style={styles.usualLine}>{line}</Text>
        </View>
      </InsightsCard>
    );
  }

  const left = toRupees(safeToday.amount);
  const amount = formatInrCompact(Math.max(0, left));
  const note =
    left > 0
      ? `${weekday}s usually run about ${usual}`
      : "The budget is used up for now. Anything more goes over it.";
  return (
    <InsightsCard kicker="SAFE TO SPEND TODAY">
      <View
        style={styles.body}
        accessible
        accessibilityLabel={`Safe to spend today: ${amount}. ${note}.`}
      >
        <Text style={[styles.amount, left <= 0 && styles.amountSpent]}>
          {amount}
        </Text>
        <Text style={styles.note}>{note}</Text>
      </View>
    </InsightsCard>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  body: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.xs,
  },
  amount: {
    fontFamily: fontFamilies.bold,
    fontSize: 32,
    lineHeight: 40,
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
  amountSpent: {
    color: colors.danger,
  },
  note: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkSoft,
  },
  usualLine: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 18,
    lineHeight: 24,
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
}));
