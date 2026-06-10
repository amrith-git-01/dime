import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  ChartTooltipOverlay,
  TwoToneCard,
  type ChartPressTooltipRow,
  type ChartTooltipAnchor,
} from "@/components/shared";
import { bento, colors, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import type { CounterpartySpendRow } from "@/features/analytics/types";
import {
  buildCounterpartyDonutData,
  type CounterpartyDonutDatum,
} from "@/features/analytics/utils/buildCounterpartyDonutData";
import { triggerLightHaptic } from "@/lib/haptics/nativeHaptics";
import { formatInrCompact } from "@/utils/currency";

import { InsightsDonutCardSkeleton } from "./InsightsAnalyticsSkeletons";
import { PayeeDonutChart, PayeeDonutEmptyChart } from "./PayeeDonutChart";

const CHART_SIZE = 192;
const LEGEND_MAX_WIDTH = 168;
const CONTENT_MIN_HEIGHT = 228;
const TOOLTIP_WIDTH = 168;
export type InsightsCounterpartyDonutCardProps = {
  counterpartySpend: CounterpartySpendRow[];
  chartYear: number;
  chartMonthIndex0: number;
  focusGeneration: number;
  loading?: boolean;
  tooltipDismissRef?: MutableRefObject<(() => void) | null>;
  /** Fired when the user taps View in the payee tooltip (navigation wired later). */
  onViewPayeePress?: (slice: CounterpartyDonutDatum) => void;
};

type PayeeTooltipState = {
  slice: CounterpartyDonutDatum;
  anchor: ChartTooltipAnchor;
};

/** Share is 0–1 from API; one decimal avoids rounded labels summing past 100%. */
export function formatPayeeShare(share: number): string {
  const pct = share * 100;
  if (!Number.isFinite(pct) || pct <= 0) {
    return "0%";
  }
  if (pct < 0.05) {
    return "<0.1%";
  }
  return `${pct.toFixed(1)}%`;
}

function buildPayeeTooltipRows(
  slice: CounterpartyDonutDatum,
): ChartPressTooltipRow[] {
  return [
    { label: "Share", value: formatPayeeShare(slice.share) },
    {
      label: "Spent",
      value: formatInrCompact(slice.debit_total),
      tone: "debit",
    },
    {
      label: "Transactions",
      value: String(slice.transaction_count),
    },
  ];
}

type DonutChartStageProps = {
  chart: ReactNode;
  center: ReactNode;
};

/** Fixed-size stage so the ring and center label share one coordinate space. */
const DonutChartStage = memo(function DonutChartStage({
  chart,
  center,
}: DonutChartStageProps) {
  return (
    <View style={styles.chartStage}>
      {chart}
      <View style={styles.chartCenter} pointerEvents="none">
        {center}
      </View>
    </View>
  );
});

const EmptyDonutLayout = memo(function EmptyDonutLayout() {
  return (
    <View style={styles.emptyContent}>
      <DonutChartStage
        chart={
          <PayeeDonutEmptyChart size={CHART_SIZE} innerRadiusRatio={0.56} />
        }
        center={
          <Text style={styles.emptyCenterPercent}>{formatPayeeShare(0)}</Text>
        }
      />
    </View>
  );
});

export const InsightsCounterpartyDonutCard = memo(
  function InsightsCounterpartyDonutCard({
    counterpartySpend,
    chartYear,
    chartMonthIndex0,
    focusGeneration,
    loading = false,
    tooltipDismissRef,
    onViewPayeePress,
  }: InsightsCounterpartyDonutCardProps) {
    const chartData = useMemo(
      () => buildCounterpartyDonutData(counterpartySpend),
      [counterpartySpend],
    );
    const hasSpend = chartData.length > 0;

    const [tooltipPayee, setTooltipPayee] = useState<PayeeTooltipState | null>(
      null,
    );

    const dismissTooltip = useCallback(() => {
      setTooltipPayee(null);
    }, []);

    useEffect(() => {
      if (!tooltipDismissRef) {
        return;
      }
      tooltipDismissRef.current = dismissTooltip;
      return () => {
        tooltipDismissRef.current = null;
      };
    }, [dismissTooltip, tooltipDismissRef]);

    const openTooltip = useCallback(
      (slice: CounterpartyDonutDatum, anchor: ChartTooltipAnchor) => {
        setTooltipPayee({ slice, anchor });
      },
      [],
    );

    const handleDonutSlicePress = useCallback(
      (slice: CounterpartyDonutDatum, anchor: ChartTooltipAnchor) => {
        openTooltip(slice, anchor);
      },
      [openTooltip],
    );

    const tooltipRows = useMemo(() => {
      if (!tooltipPayee) {
        return [];
      }
      return buildPayeeTooltipRows(tooltipPayee.slice);
    }, [tooltipPayee]);

    const handleTooltipViewPress = useCallback(() => {
      const payee = tooltipPayee?.slice;
      if (!payee) {
        return;
      }
      dismissTooltip();
      onViewPayeePress?.(payee);
    }, [dismissTooltip, onViewPayeePress, tooltipPayee]);

    const tooltipViewAction = useMemo(
      () => ({ onPress: handleTooltipViewPress }),
      [handleTooltipViewPress],
    );

    const topSlice = chartData[0];
    const donutAnimationKey = `payee-donut-${chartYear}-${chartMonthIndex0}-${focusGeneration}`;

    const handleLegendPress = useCallback(
      (slice: CounterpartyDonutDatum) => {
        void triggerLightHaptic();
        dismissTooltip();
        onViewPayeePress?.(slice);
      },
      [dismissTooltip, onViewPayeePress],
    );

    return (
      <>
        <TwoToneCard
          header={
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Who you paid</Text>
              <Text style={styles.headerSubtitle}>
                Debit spending by payee this month
              </Text>
            </View>
          }
          body={
            <View style={styles.body}>
              {loading ? (
                <InsightsDonutCardSkeleton />
              ) : !hasSpend ? (
                <EmptyDonutLayout />
              ) : (
                <View style={styles.contentRow}>
                  <View style={styles.donutLegendCluster}>
                    <DonutChartStage
                      chart={
                        <PayeeDonutChart
                          key={donutAnimationKey}
                          data={chartData}
                          size={CHART_SIZE}
                          innerRadiusRatio={0.56}
                          animationKey={donutAnimationKey}
                          onSlicePress={handleDonutSlicePress}
                        />
                      }
                      center={
                        topSlice ? (
                          <>
                            <Text style={styles.centerLabel} numberOfLines={1}>
                              {topSlice.display_name}
                            </Text>
                            <Text style={styles.centerMeta}>
                              {formatPayeeShare(topSlice.share)}
                            </Text>
                          </>
                        ) : null
                      }
                    />

                    <View style={styles.legend}>
                      {chartData.map((slice) => (
                        <LegendRow
                          key={slice.payee_key}
                          slice={slice}
                          onPress={() => handleLegendPress(slice)}
                        />
                      ))}
                    </View>
                  </View>
                </View>
              )}
            </View>
          }
        />

        <ChartTooltipOverlay
          visible={tooltipPayee != null}
          onDismiss={dismissTooltip}
          title={tooltipPayee?.slice.display_name ?? ""}
          rows={tooltipRows}
          anchor={tooltipPayee?.anchor ?? null}
          width={TOOLTIP_WIDTH}
          viewAction={tooltipViewAction}
        />
      </>
    );
  },
);

type LegendRowProps = {
  slice: CounterpartyDonutDatum;
  onPress: () => void;
};

const LegendRow = memo(function LegendRow({ slice, onPress }: LegendRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View transactions for ${slice.display_name}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.legendRow,
        pressed && styles.legendRowPressed,
      ]}
    >
      <View style={[styles.legendSwatch, { backgroundColor: slice.color }]} />
      <View style={styles.legendTextCol}>
        <Text style={styles.legendName} numberOfLines={1}>
          {slice.display_name}
        </Text>
        <Text style={styles.legendMeta}>
          {formatPayeeShare(slice.share)} ·{" "}
          {formatInrCompact(slice.debit_total)}
        </Text>
      </View>
    </Pressable>
  );
});

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
    width: "100%",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    minHeight: CONTENT_MIN_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  contentRow: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    minHeight: CONTENT_MIN_HEIGHT - spacing.sm - spacing.lg,
  },
  donutLegendCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    maxWidth: "100%",
  },
  chartStage: {
    width: CHART_SIZE,
    height: CHART_SIZE,
    flexShrink: 0,
  },
  emptyContent: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    minHeight: CONTENT_MIN_HEIGHT - spacing.sm - spacing.lg,
  },
  chartCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  centerLabel: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 11,
    lineHeight: 14,
    color: colors.textPrimary,
    textAlign: "center",
  },
  centerMeta: {
    marginTop: 2,
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 10,
    lineHeight: 13,
    color: colors.primary,
    textAlign: "center",
  },
  emptyCenterPercent: {
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 14,
    lineHeight: 18,
    color: colors.primary,
    textAlign: "center",
  },
  legend: {
    flexShrink: 1,
    maxWidth: LEGEND_MAX_WIDTH,
    gap: 8,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: 5,
    paddingHorizontal: spacing.xs,
    borderRadius: 8,
  },
  legendRowPressed: {
    opacity: 0.88,
  },
  legendSwatch: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendTextCol: {
    flexShrink: 1,
    minWidth: 0,
  },
  legendName: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textPrimary,
  },
  legendMeta: {
    marginTop: 1,
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 10,
    lineHeight: 13,
    color: bento.onPastel.muted,
  },
});
