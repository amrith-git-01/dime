import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
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
import { INSIGHTS_CHART_DONUT_ANIMATION } from "@/features/analytics/constants/chartAnimation";
import {
  COUNTERPARTY_DONUT_INNER_RADIUS_RATIO,
  INSIGHTS_COUNTERPARTY_DONUT_SIZE,
} from "@/features/analytics/constants/counterpartyDonut";
import { COUNTERPARTY_DONUT_OTHER_KEY } from "@/features/analytics/constants/counterpartyDonutColors";
import type { CounterpartySpendRow } from "@/features/analytics/types";
import {
  buildCounterpartyDonutData,
  type CounterpartyDonutDatum,
} from "@/features/analytics/utils/buildCounterpartyDonutData";
import { formatPayeeShare } from "@/features/analytics/utils/formatPayeeShare";
import { triggerLightHaptic } from "@/lib/haptics/nativeHaptics";
import { formatInrCompact } from "@/utils/currency";

import { useChartInViewport } from "@/features/analytics/hooks/useChartInViewport";
import { usePieClockwiseEntry } from "@/features/analytics/hooks/usePieClockwiseEntry";

import { ClockwiseAnimatedPie } from "./ClockwiseAnimatedPie";
import { PayeeDonutEmptyChart } from "./PayeeDonutChart";
import { PayeeDonutPressable } from "./PayeeDonutPressable";

const LEGEND_MAX_WIDTH = 168;
const CONTENT_MIN_HEIGHT = 228;
const TOOLTIP_WIDTH = 168;

export type InsightsCounterpartyDonutCardProps = {
  counterpartySpend: CounterpartySpendRow[];
  chartYear: number;
  chartMonthIndex0: number;
  chartsDataSettled: boolean;
  chartLoading?: boolean;
  tooltipDismissRef?: MutableRefObject<(() => void) | null>;
  /** Fired when the user taps View in the payee tooltip (navigation wired later). */
  onViewPayeePress?: (slice: CounterpartyDonutDatum) => void;
};

type PayeeTooltipState = {
  slice: CounterpartyDonutDatum;
  anchor: ChartTooltipAnchor;
};

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

const EmptyDonutLayout = memo(function EmptyDonutLayout() {
  return (
    <View style={styles.emptyContent}>
      <PayeeDonutEmptyChart
        size={INSIGHTS_COUNTERPARTY_DONUT_SIZE}
        innerRadiusRatio={COUNTERPARTY_DONUT_INNER_RADIUS_RATIO}
      />
    </View>
  );
});

export const InsightsCounterpartyDonutCard = memo(
  function InsightsCounterpartyDonutCard({
    counterpartySpend,
    chartYear,
    chartMonthIndex0,
    chartsDataSettled,
    chartLoading = false,
    tooltipDismissRef,
    onViewPayeePress,
  }: InsightsCounterpartyDonutCardProps) {
    const chartData = useMemo(
      () => buildCounterpartyDonutData(counterpartySpend),
      [counterpartySpend],
    );
    const hasSpend = chartData.length > 0;
    const { containerRef, onChartLayout, isFullyVisible } =
      useChartInViewport("center");

    const donutEntryProgress = usePieClockwiseEntry({
      identity: `donut-${chartYear}-${chartMonthIndex0}`,
      enabled: chartsDataSettled && !chartLoading && hasSpend,
      isVisible: isFullyVisible,
      animateConfig: INSIGHTS_CHART_DONUT_ANIMATION,
    });

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

    const tooltipViewAction = useMemo(() => {
      if (!tooltipPayee) {
        return undefined;
      }
      return {
        label:
          tooltipPayee.slice.payee_key === COUNTERPARTY_DONUT_OTHER_KEY
            ? "View other payees"
            : undefined,
        onPress: handleTooltipViewPress,
      };
    }, [handleTooltipViewPress, tooltipPayee]);

    const handleLegendPress = useCallback(
      (slice: CounterpartyDonutDatum, anchor: ChartTooltipAnchor) => {
        void triggerLightHaptic();
        openTooltip(slice, anchor);
      },
      [openTooltip],
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
              {chartLoading || !hasSpend ? (
                <EmptyDonutLayout />
              ) : (
                <View
                  ref={containerRef}
                  collapsable={false}
                  onLayout={onChartLayout}
                  style={styles.contentRow}
                >
                  <View style={styles.donutLegendCluster}>
                    <PayeeDonutPressable
                      data={chartData}
                      size={INSIGHTS_COUNTERPARTY_DONUT_SIZE}
                      innerRadiusRatio={COUNTERPARTY_DONUT_INNER_RADIUS_RATIO}
                      onSlicePress={handleDonutSlicePress}
                    >
                      <ClockwiseAnimatedPie
                        data={chartData}
                        size={INSIGHTS_COUNTERPARTY_DONUT_SIZE}
                        innerRadiusRatio={COUNTERPARTY_DONUT_INNER_RADIUS_RATIO}
                        progress={donutEntryProgress}
                      />
                    </PayeeDonutPressable>

                    <View style={styles.legend}>
                      {chartData.map((slice) => (
                        <LegendRow
                          key={slice.payee_key}
                          slice={slice}
                          onPress={handleLegendPress}
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
  onPress: (slice: CounterpartyDonutDatum, anchor: ChartTooltipAnchor) => void;
};

const LegendRow = memo(function LegendRow({ slice, onPress }: LegendRowProps) {
  const rowRef = useRef<View>(null);

  const handlePress = useCallback(() => {
    rowRef.current?.measureInWindow((x, y, width, height) => {
      onPress(slice, { x, y, width, height });
    });
  }, [onPress, slice]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View details for ${slice.display_name}`}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.legendRow,
        pressed && styles.legendRowPressed,
      ]}
    >
      <View ref={rowRef} collapsable={false} style={styles.legendRowInner}>
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
  emptyContent: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    minHeight: CONTENT_MIN_HEIGHT - spacing.sm - spacing.lg,
  },
  legend: {
    flexShrink: 1,
    maxWidth: LEGEND_MAX_WIDTH,
    gap: 8,
  },
  legendRow: {
    borderRadius: 8,
  },
  legendRowInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: 5,
    paddingHorizontal: spacing.xs,
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
