import { memo } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import {
  BentoStatCell,
  MonthSummaryStatDivider,
  MonthSummaryStatsRow,
  TwoToneCard,
} from "@/components/shared";
import { bento, colors, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";

import type { InsightsBurnRateMetrics } from "../utils/computeBurnRateMetrics";

export type InsightsBurnRateMetricCardProps = {
  metrics: InsightsBurnRateMetrics | null;
  loading?: boolean;
};

export const InsightsBurnRateMetricCard = memo(
  function InsightsBurnRateMetricCard({
    metrics,
    loading = false,
  }: InsightsBurnRateMetricCardProps) {
    const spentTone = metrics?.isOverPace ? "debit" : "neutral";
    const projectedTone =
      metrics?.hasMonthlyBudget &&
      metrics.projected > (metrics.monthlyBudget ?? 0)
        ? "debit"
        : "neutral";

    return (
      <TwoToneCard
        header={
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Monthly pace</Text>
            <Text style={styles.headerSubtitle}>
              How fast spending adds up this month
            </Text>
          </View>
        }
        body={
          <View style={styles.body}>
            {loading ? (
              <View style={styles.loading}>
                <ActivityIndicator color={colors.primary} size="small" />
              </View>
            ) : metrics == null ? (
              <Text style={styles.empty}>No spending data for this month.</Text>
            ) : (
              <>
                <MonthSummaryStatsRow>
                  <BentoStatCell
                    label="Spent so far"
                    value={metrics.spentDisplay}
                    tone={spentTone}
                  />
                  <MonthSummaryStatDivider />
                  <BentoStatCell
                    label={metrics.idealLabel}
                    value={metrics.idealDisplay}
                  />
                  <MonthSummaryStatDivider />
                  <BentoStatCell
                    label={metrics.projectedLabel}
                    value={metrics.projectedDisplay}
                    tone={projectedTone}
                  />
                </MonthSummaryStatsRow>

                {!metrics.hasMonthlyBudget ? (
                  <Text style={styles.budgetHint}>
                    Set a monthly budget to compare spend against an even pace.
                  </Text>
                ) : null}
              </>
            )}
          </View>
        }
      />
    );
  },
);

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerTitle: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    lineHeight: 20,
    color: colors.primary,
  },
  headerSubtitle: {
    marginTop: 2,
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    lineHeight: 15,
    color: bento.onPastel.muted,
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  loading: {
    minHeight: 72,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    lineHeight: 18,
    color: bento.onPastel.muted,
    textAlign: "center",
    paddingVertical: spacing.md,
  },
  budgetHint: {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    lineHeight: 15,
    color: bento.onPastel.muted,
    paddingHorizontal: spacing.xs,
  },
});
