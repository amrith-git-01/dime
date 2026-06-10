import { memo, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { SkeletonBlock } from "@/components/ui";
import { bento, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { formatPayeeShare } from "@/features/analytics/components/InsightsCounterpartyDonutCard";
import {
  PayeeDonutChart,
  PayeeDonutEmptyChart,
} from "@/features/analytics/components/PayeeDonutChart";
import { COMPARE_DONUT_SIZE } from "@/features/analytics/constants/compare";
import type { CounterpartySpendRow } from "@/features/analytics/types";
import { buildCounterpartyDonutData } from "@/features/analytics/utils/buildCounterpartyDonutData";
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
  loading,
  failed,
}: {
  counterpartySpend: CounterpartySpendRow[];
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

  if (failed) {
    return <CompareColumnError />;
  }
  if (loading) {
    return <PayeeColumnSkeleton />;
  }

  const hasData = donutData.some((slice) => slice.value > 0);

  return (
    <View style={styles.column} pointerEvents="none">
      <View style={styles.donutWrap}>
        {hasData ? (
          <PayeeDonutChart data={donutData} size={COMPARE_DONUT_SIZE} />
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
            loading={leftLoading}
            failed={leftFailed}
          />
        }
        right={
          <PayeeColumn
            counterpartySpend={rightSpend}
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
