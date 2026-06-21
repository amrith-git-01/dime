import { memo } from "react";
import { StyleSheet, View } from "react-native";

import { SkeletonBlock } from "@/components/ui";
import { COMPARE_CASHFLOW_PLOT_HEIGHT } from "@/features/analytics/constants/compare";
import type { DailyCashflowRow } from "@/features/analytics/types";

import { CompareCashflowColumn } from "./CompareCashflowColumn";
import {
  CompareColumnError,
  ComparePairedColumns,
  ComparePairedLayout,
} from "./ComparePairedLayout";

export type CompareCashflowSectionProps = {
  leftLabel: string;
  rightLabel: string;
  leftCashflow: DailyCashflowRow[];
  rightCashflow: DailyCashflowRow[];
  leftYear: number;
  leftMonthIndex0: number;
  rightYear: number;
  rightMonthIndex0: number;
  leftLoading: boolean;
  rightLoading: boolean;
  leftFailed: boolean;
  rightFailed: boolean;
};

function CashflowColumnSkeleton() {
  return (
    <View style={styles.skeleton}>
      <SkeletonBlock
        tone="surface"
        style={{ height: COMPARE_CASHFLOW_PLOT_HEIGHT, borderRadius: 8 }}
      />
    </View>
  );
}

function CashflowColumn({
  dailyCashflow,
  year,
  monthIndex0,
  loading,
  failed,
}: {
  dailyCashflow: DailyCashflowRow[];
  year: number;
  monthIndex0: number;
  loading: boolean;
  failed: boolean;
}) {
  if (failed) {
    return <CompareColumnError />;
  }
  if (loading) {
    return <CashflowColumnSkeleton />;
  }
  return (
    <CompareCashflowColumn
      dailyCashflow={dailyCashflow}
      year={year}
      monthIndex0={monthIndex0}
    />
  );
}

export const CompareCashflowSection = memo(function CompareCashflowSection(
  props: CompareCashflowSectionProps,
) {
  const {
    leftLabel,
    rightLabel,
    leftCashflow,
    rightCashflow,
    leftYear,
    leftMonthIndex0,
    rightYear,
    rightMonthIndex0,
    leftLoading,
    rightLoading,
    leftFailed,
    rightFailed,
  } = props;

  return (
    <ComparePairedLayout
      kicker="DAILY CASH FLOW"
      subtitle="Income, spending, and net each day"
      leftLabel={leftLabel}
      rightLabel={rightLabel}
    >
      <ComparePairedColumns
        left={
          <CashflowColumn
            dailyCashflow={leftCashflow}
            year={leftYear}
            monthIndex0={leftMonthIndex0}
            loading={leftLoading}
            failed={leftFailed}
          />
        }
        right={
          <CashflowColumn
            dailyCashflow={rightCashflow}
            year={rightYear}
            monthIndex0={rightMonthIndex0}
            loading={rightLoading}
            failed={rightFailed}
          />
        }
      />
    </ComparePairedLayout>
  );
});

const styles = StyleSheet.create({
  skeleton: {
    width: "100%",
  },
});
