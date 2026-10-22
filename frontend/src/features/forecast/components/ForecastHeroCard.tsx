import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ProgressBar } from "@/components/ui";
import { spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { InsightsCard } from "@/features/analytics/components/InsightsCard";
import { createThemedStyles, useTheme } from "@/theme";
import { formatInrCompact } from "@/utils/currency";

import { FORECAST_LEARNING_DAYS, type ForecastResponse } from "../types";
import {
  formatAccuracyWithin,
  formatChance,
  formatRangeText,
  toRupees,
} from "../utils/forecastFormat";
import { ForecastBand } from "./ForecastBand";

type ForecastHeroCardProps = {
  forecast: ForecastResponse;
};

const EM_DASH = "—";

/**
 * Where the month will likely land: the middle of the range as a big number, the range as a
 * band against the budget (and as text), the chance of staying under it, and what the forecast
 * knows about itself (still learning, or how last month's went).
 */
export const ForecastHeroCard = memo(function ForecastHeroCard({
  forecast,
}: ForecastHeroCardProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { landing, mode, historyDays, accuracy, summary } = forecast;

  const p50 = toRupees(landing.p50);
  const budget = landing.budget === null ? 0 : toRupees(landing.budget);
  const hasBudget = budget > 0;
  const hasLanding = p50 > 0;
  const overBudget = hasBudget && p50 > budget;
  const learning = mode === "learning";
  const learnedDays = Math.min(historyDays, FORECAST_LEARNING_DAYS);

  const headline = learning
    ? "At this pace the month may end near"
    : "This month will likely land at";
  const landingText = formatInrCompact(landing.p50);
  const rangeText = formatRangeText(landing.p10, landing.p90);
  const budgetText = hasBudget ? formatInrCompact(budget) : null;
  const chanceText =
    hasBudget && landing.chanceUnder !== null
      ? `${formatChance(landing.chanceUnder)} chance you stay under ${budgetText}`
      : null;
  const learningText = `Learning your patterns ${EM_DASH} ${learnedDays} of ${FORECAST_LEARNING_DAYS} days`;

  const chanceColor =
    landing.chanceUnder === null
      ? colors.inkSoft
      : landing.chanceUnder >= 0.6
        ? colors.success
        : landing.chanceUnder >= 0.3
          ? colors.warning
          : colors.danger;

  const spokenParts = hasLanding
    ? [
        `${headline} ${landingText}.`,
        `Likely between ${formatInrCompact(landing.p10)} and ${formatInrCompact(landing.p90)}.`,
        chanceText ? `${chanceText}.` : null,
        summary,
      ]
    : [learningText, summary];

  return (
    <InsightsCard
      kicker="MONTH FORECAST"
      subtitle="Where this month is likely to end"
    >
      <View
        style={styles.body}
        accessible
        accessibilityLabel={spokenParts.filter(Boolean).join(" ")}
      >
        {hasLanding ? (
          <>
            <View style={styles.headlineBlock}>
              <Text style={styles.headline}>{headline}</Text>
              <Text
                style={[styles.landing, overBudget && styles.landingOver]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {landingText}
              </Text>
            </View>
            <ForecastBand landing={landing} overBudget={overBudget} />
            <View style={styles.legendRow}>
              <Text style={styles.legendText}>{`Range ${rangeText}`}</Text>
              {budgetText ? (
                <Text style={styles.legendText}>{`Budget ${budgetText}`}</Text>
              ) : null}
            </View>
            {chanceText ? (
              <Text style={[styles.chance, { color: chanceColor }]}>
                {chanceText}
              </Text>
            ) : (
              <Text style={styles.hint}>
                Set a monthly budget to see your chance of staying under it.
              </Text>
            )}
          </>
        ) : (
          <Text style={styles.headline}>
            Add a few days of spending and Dime will start forecasting your
            month.
          </Text>
        )}
        {summary ? <Text style={styles.summary}>{summary}</Text> : null}
      </View>

      {hasLanding ? (
        <>
          <View style={styles.divider} />
          <View style={styles.statsRow}>
            <StatCell
              label="Spent so far"
              value={formatInrCompact(landing.spentSoFar)}
            />
            <View style={styles.statDivider} />
            <StatCell
              label="Bills still due"
              value={formatInrCompact(landing.billsStillDue)}
            />
            <View style={styles.statDivider} />
            <StatCell
              label="Everyday to come"
              value={formatInrCompact(landing.flexibleRemaining)}
            />
          </View>
        </>
      ) : null}

      {mode !== "full" || accuracy ? (
        <>
          <View style={styles.divider} />
          <View style={styles.footnotes}>
            {mode !== "full" ? (
              <View style={styles.learningBlock}>
                <Text style={styles.footnote}>
                  {learning
                    ? learningText
                    : `Ranges are wider while Dime learns your patterns ${EM_DASH} ${learnedDays} of ${FORECAST_LEARNING_DAYS} days`}
                </Text>
                <ProgressBar
                  progress={learnedDays / FORECAST_LEARNING_DAYS}
                  height={4}
                  fillColor={colors.inkSoft}
                  backgroundColor={colors.surfaceSunken}
                />
              </View>
            ) : null}
            {accuracy ? (
              <Text style={styles.footnote}>
                {`Last month's forecast was within ${formatAccuracyWithin(accuracy.lastMonthErrorPct)}`}
              </Text>
            ) : null}
          </View>
        </>
      ) : null}
    </InsightsCard>
  );
});

function StatCell({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={styles.statCell}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const useStyles = createThemedStyles(({ colors }) => ({
  body: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  headlineBlock: {
    gap: 2,
  },
  headline: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
  },
  landing: {
    fontFamily: fontFamilies.bold,
    fontSize: 32,
    lineHeight: 40,
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
  landingOver: {
    color: colors.danger,
  },
  legendRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  legendText: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkSoft,
    fontVariant: ["tabular-nums"],
  },
  chance: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 14,
    lineHeight: 20,
  },
  hint: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkFaint,
  },
  summary: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.ink,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
    marginHorizontal: spacing.lg,
  },
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  statCell: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
    alignSelf: "stretch",
  },
  statLabel: {
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    lineHeight: 15,
    color: colors.inkSoft,
    textAlign: "center",
  },
  statValue: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 14,
    lineHeight: 20,
    color: colors.ink,
    fontVariant: ["tabular-nums"],
    textAlign: "center",
  },
  footnotes: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  learningBlock: {
    gap: spacing.xs,
  },
  footnote: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkSoft,
  },
}));
