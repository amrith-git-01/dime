import { useIsFocused } from "@react-navigation/native";
import { memo, useMemo } from "react";
import { StyleSheet, View } from "react-native";

import { EmptyState, emptyStateCopy } from "@/components/shared";
import { SkeletonBlock } from "@/components/ui";
import { spacing } from "@/constants";
import { ClockwiseAnimatedPie } from "@/features/analytics/components/ClockwiseAnimatedPie";
import { PayeeDonutLegendList } from "@/features/analytics/components/PayeeDonutLegendList";
import { INSIGHTS_CHART_DONUT_ANIMATION } from "@/features/analytics/constants/chartAnimation";
import { COMPARE_DONUT_SIZE } from "@/features/analytics/constants/compare";
import { COUNTERPARTY_DONUT_INNER_RADIUS_RATIO } from "@/features/analytics/constants/counterpartyDonut";
import { usePieClockwiseEntry } from "@/features/analytics/hooks/usePieClockwiseEntry";
import type { CounterpartySpendRow } from "@/features/analytics/types";
import { buildCounterpartyDonutData } from "@/features/analytics/utils/buildCounterpartyDonutData";

import {
  CompareColumnError,
  ComparePairedColumns,
  ComparePairedLayout,
} from "./ComparePairedLayout";

export type ComparePayeeSectionProps = {
  leftLabel: string;
  rightLabel: string;
  leftSpend: CounterpartySpendRow[];
  rightSpend: CounterpartySpendRow[];
  leftYear: number;
  leftMonthIndex0: number;
  rightYear: number;
  rightMonthIndex0: number;
  leftLoading: boolean;
  rightLoading: boolean;
  leftFailed: boolean;
  rightFailed: boolean;
};

function PayeeColumnSkeleton() {
  return (
    <View style={styles.skeleton}>
      <SkeletonBlock
        tone="surface"
        style={{
          width: COMPARE_DONUT_SIZE,
          height: COMPARE_DONUT_SIZE,
          borderRadius: COMPARE_DONUT_SIZE / 2,
          alignSelf: "center",
        }}
      />
    </View>
  );
}

function PayeeColumn({
  counterpartySpend,
  year,
  monthIndex0,
  loading,
  failed,
}: {
  counterpartySpend: CounterpartySpendRow[];
  year: number;
  monthIndex0: number;
  loading: boolean;
  failed: boolean;
}) {
  const donutData = useMemo(
    () => buildCounterpartyDonutData(counterpartySpend),
    [counterpartySpend],
  );
  const legendSlices = useMemo(
    () => donutData.filter((slice) => slice.value > 0),
    [donutData],
  );
  const hasData = legendSlices.length > 0;
  const isFocused = useIsFocused();
  const donutEntryProgress = usePieClockwiseEntry({
    identity: `compare-donut-${year}-${monthIndex0}`,
    enabled: !loading && hasData,
    isVisible: isFocused,
    animateConfig: INSIGHTS_CHART_DONUT_ANIMATION,
  });

  if (failed) {
    return <CompareColumnError />;
  }
  if (loading) {
    return <PayeeColumnSkeleton />;
  }

  return (
    <View style={styles.column} pointerEvents="none">
      {hasData ? (
        <>
          <View style={styles.donutWrap}>
            <ClockwiseAnimatedPie
              data={donutData}
              size={COMPARE_DONUT_SIZE}
              innerRadiusRatio={COUNTERPARTY_DONUT_INNER_RADIUS_RATIO}
              progress={donutEntryProgress}
            />
          </View>
          <PayeeDonutLegendList slices={legendSlices} />
        </>
      ) : (
        <EmptyState
          layout="inset"
          compact
          headline={emptyStateCopy.comparePayees.headline}
          subtext={emptyStateCopy.comparePayees.subtext}
        />
      )}
    </View>
  );
}

export const ComparePayeeSection = memo(function ComparePayeeSection({
  leftLabel,
  rightLabel,
  leftSpend,
  rightSpend,
  leftYear,
  leftMonthIndex0,
  rightYear,
  rightMonthIndex0,
  leftLoading,
  rightLoading,
  leftFailed,
  rightFailed,
}: ComparePayeeSectionProps) {
  return (
    <ComparePairedLayout
      kicker="WHO YOU PAID"
      subtitle="Where spending went"
      leftLabel={leftLabel}
      rightLabel={rightLabel}
    >
      <ComparePairedColumns
        left={
          <PayeeColumn
            counterpartySpend={leftSpend}
            year={leftYear}
            monthIndex0={leftMonthIndex0}
            loading={leftLoading}
            failed={leftFailed}
          />
        }
        right={
          <PayeeColumn
            counterpartySpend={rightSpend}
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
  column: {
    alignItems: "stretch",
    gap: spacing.sm,
  },
  donutWrap: {
    alignItems: "center",
  },
  skeleton: {
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
});
