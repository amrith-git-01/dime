import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { netTone } from "@/components/shared";
import { spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import type { InsightsMonthSummary } from "@/features/analytics/components";

import { CompareMiniStat } from "./CompareMiniStat";
import {
  CompareColumnError,
  ComparePairedColumns,
  ComparePairedLayout,
} from "./ComparePairedLayout";
import { createThemedStyles } from "@/theme";

export type CompareSummarySectionProps = {
  leftLabel: string;
  rightLabel: string;
  leftSummary: InsightsMonthSummary | null;
  rightSummary: InsightsMonthSummary | null;
  leftLoading: boolean;
  rightLoading: boolean;
  leftFailed: boolean;
  rightFailed: boolean;
  spentDelta: string | null;
};

function SummaryColumn({
  summary,
  loading,
  failed,
  showSplit,
}: {
  summary: InsightsMonthSummary | null;
  loading: boolean;
  failed: boolean;
  /** Show the fixed / flexible rows (when either month has fixed spend). */
  showSplit: boolean;
}) {
  const styles = useStyles();
  if (failed) {
    return <CompareColumnError />;
  }

  const remainingTone = summary?.isOverBudget
    ? "debit"
    : summary && summary.remainingValue > 0
      ? "credit"
      : "neutral";

  return (
    <View style={styles.columnStats}>
      <CompareMiniStat
        label="Spent"
        value={summary?.spentDisplay ?? "\u2014"}
        tone="debit"
        loading={loading}
      />
      {showSplit ? (
        <>
          <CompareMiniStat
            label="Fixed"
            value={summary?.fixedDisplay ?? "—"}
            tone="neutral"
            loading={loading}
          />
          <CompareMiniStat
            label="Flexible"
            value={summary?.flexibleDisplay ?? "—"}
            tone="neutral"
            loading={loading}
          />
        </>
      ) : null}
      <CompareMiniStat
        label="Income"
        value={summary?.incomeDisplay ?? "\u2014"}
        tone="credit"
        loading={loading}
      />
      <CompareMiniStat
        label="Net"
        value={summary?.netDisplay ?? "\u2014"}
        tone={summary ? netTone(summary.netValue) : "neutral"}
        loading={loading}
      />
      <View style={styles.budgetGroup}>
        <CompareMiniStat
          label="Used"
          value={summary?.usedPctDisplay ?? "\u2014"}
          tone={summary?.isOverBudget ? "debit" : "neutral"}
          loading={loading}
        />
        <CompareMiniStat
          label={summary?.isOverBudget ? "Over" : "Remaining"}
          value={summary?.remainingDisplay ?? "\u2014"}
          tone={remainingTone}
          loading={loading}
        />
      </View>
    </View>
  );
}

export const CompareSummarySection = memo(function CompareSummarySection({
  leftLabel,
  rightLabel,
  leftSummary,
  rightSummary,
  leftLoading,
  rightLoading,
  leftFailed,
  rightFailed,
  spentDelta,
}: CompareSummarySectionProps) {
  const styles = useStyles();
  const showSplit = Boolean(leftSummary?.hasFixed || rightSummary?.hasFixed);
  return (
    <ComparePairedLayout
      kicker="MONTH SUMMARY"
      subtitle="Spending, income, and budget at a glance"
      leftLabel={leftLabel}
      rightLabel={rightLabel}
      footer={
        spentDelta ? <Text style={styles.deltaRow}>{spentDelta}</Text> : null
      }
    >
      <ComparePairedColumns
        left={
          <SummaryColumn
            summary={leftSummary}
            loading={leftLoading}
            failed={leftFailed}
            showSplit={showSplit}
          />
        }
        right={
          <SummaryColumn
            summary={rightSummary}
            loading={rightLoading}
            failed={rightFailed}
            showSplit={showSplit}
          />
        }
      />
    </ComparePairedLayout>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  columnStats: {
    gap: spacing.sm,
  },
  budgetGroup: {
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    gap: spacing.sm,
  },
  deltaRow: {
    marginTop: spacing.xs,
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    lineHeight: 15,
    color: colors.inkFaint,
    textAlign: "center",
  },
}));
