import { memo } from "react";
import { StyleSheet, View } from "react-native";

import { spacing } from "@/constants";
import type { InsightsBurnRateMetrics } from "@/features/analytics/utils/computeBurnRateMetrics";

import { CompareMiniStat } from "./CompareMiniStat";
import {
  CompareColumnError,
  ComparePairedColumns,
  ComparePairedLayout,
} from "./ComparePairedLayout";

export type ComparePaceSectionProps = {
  leftLabel: string;
  rightLabel: string;
  leftMetrics: InsightsBurnRateMetrics | null;
  rightMetrics: InsightsBurnRateMetrics | null;
  leftLoading: boolean;
  rightLoading: boolean;
  leftFailed: boolean;
  rightFailed: boolean;
};

function PaceColumn({
  metrics,
  loading,
  failed,
}: {
  metrics: InsightsBurnRateMetrics | null;
  loading: boolean;
  failed: boolean;
}) {
  if (failed) {
    return <CompareColumnError />;
  }

  const spentTone = !loading && metrics?.isOverPace ? "debit" : "neutral";
  const projectedTone =
    !loading &&
    metrics?.hasMonthlyBudget &&
    metrics.projected > (metrics.monthlyBudget ?? 0)
      ? "debit"
      : "neutral";

  return (
    <View style={styles.columnStats}>
      <CompareMiniStat
        label="Spent so far"
        value={metrics?.spentDisplay ?? "\u2014"}
        tone={spentTone}
        loading={loading}
      />
      <CompareMiniStat
        label={metrics?.idealLabel ?? "Ideal"}
        value={metrics?.idealDisplay ?? "\u2014"}
        loading={loading}
      />
      <CompareMiniStat
        label={metrics?.projectedLabel ?? "At this pace"}
        value={metrics?.projectedDisplay ?? "\u2014"}
        tone={projectedTone}
        loading={loading}
      />
    </View>
  );
}

export const ComparePaceSection = memo(function ComparePaceSection({
  leftLabel,
  rightLabel,
  leftMetrics,
  rightMetrics,
  leftLoading,
  rightLoading,
  leftFailed,
  rightFailed,
}: ComparePaceSectionProps) {
  return (
    <ComparePairedLayout
      kicker="MONTHLY PACE"
      subtitle="How fast spending added up each month"
      leftLabel={leftLabel}
      rightLabel={rightLabel}
    >
      <ComparePairedColumns
        left={
          <PaceColumn
            metrics={leftMetrics}
            loading={leftLoading}
            failed={leftFailed}
          />
        }
        right={
          <PaceColumn
            metrics={rightMetrics}
            loading={rightLoading}
            failed={rightFailed}
          />
        }
      />
    </ComparePairedLayout>
  );
});

const styles = StyleSheet.create({
  columnStats: {
    gap: spacing.sm,
  },
});
