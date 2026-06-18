import { useIsFocused } from "@react-navigation/native";
import { memo, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { SkeletonBlock } from "@/components/ui";
import { bento, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { ClockwiseAnimatedPie } from "@/features/analytics/components/ClockwiseAnimatedPie";
import { PayeeDonutEmptyChart } from "@/features/analytics/components/PayeeDonutChart";
import { INSIGHTS_CHART_DONUT_ANIMATION } from "@/features/analytics/constants/chartAnimation";
import { COMPARE_DONUT_SIZE } from "@/features/analytics/constants/compare";
import { COUNTERPARTY_DONUT_INNER_RADIUS_RATIO } from "@/features/analytics/constants/counterpartyDonut";
import { usePieClockwiseEntry } from "@/features/analytics/hooks/usePieClockwiseEntry";
import type { CounterpartySpendRow } from "@/features/analytics/types";
import { buildCounterpartyDonutData } from "@/features/analytics/utils/buildCounterpartyDonutData";
import { formatPayeeShare } from "@/features/analytics/utils/formatPayeeShare";
import { formatInrCompact } from "@/utils/currency";

import {
  CompareColumnEmpty,
  CompareColumnError,
  ComparePairedColumns,
  ComparePairedLayout,
} from "./ComparePairedLayout";

const TOP_PAYEE_COUNT = 3;

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
  const topPayees = useMemo(
    () =>
      donutData.filter((slice) => slice.value > 0).slice(0, TOP_PAYEE_COUNT),
    [donutData],
  );
  const hasData = donutData.some((slice) => slice.value > 0);
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
      <View style={styles.donutWrap}>
        {hasData ? (
          <ClockwiseAnimatedPie
            data={donutData}
            size={COMPARE_DONUT_SIZE}
            innerRadiusRatio={COUNTERPARTY_DONUT_INNER_RADIUS_RATIO}
            progress={donutEntryProgress}
          />
        ) : (
          <PayeeDonutEmptyChart size={COMPARE_DONUT_SIZE} />
        )}
      </View>
      {topPayees.length > 0 ? (
        <View style={styles.payeeList}>
          {topPayees.map((slice) => (
            <View key={slice.payee_key} style={styles.payeeRow}>
              <Text style={styles.payeeName} numberOfLines={1}>
                {slice.display_name}
              </Text>
              <Text style={styles.payeeMeta} numberOfLines={1}>
                {formatPayeeShare(slice.share)} ·{" "}
                {formatInrCompact(slice.debit_total)}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <CompareColumnEmpty message="No payees this month" />
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
      title="Who you paid"
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
  payeeList: {
    gap: spacing.xs,
  },
  payeeRow: {
    gap: 1,
  },
  payeeName: {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    lineHeight: 14,
    color: bento.onPastel.primary,
  },
  payeeMeta: {
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 10,
    lineHeight: 13,
    color: bento.onPastel.muted,
  },
  skeleton: {
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
});
