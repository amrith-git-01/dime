import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MutableRefObject,
} from "react";
import { StyleSheet, View } from "react-native";

import {
  ChartTooltipOverlay,
  EmptyState,
  emptyStateCopy,
  type ChartPressTooltipRow,
  type ChartTooltipAnchor,
} from "@/components/shared";
import { spacing } from "@/constants";
import { INSIGHTS_CHART_DONUT_ANIMATION } from "@/features/analytics/constants/chartAnimation";
import {
  COUNTERPARTY_DONUT_INNER_RADIUS_RATIO,
  INSIGHTS_COUNTERPARTY_DONUT_SIZE,
} from "@/features/analytics/constants/counterpartyDonut";
import { useTheme } from "@/theme";
import { COUNTERPARTY_DONUT_OTHER_KEY } from "@/features/analytics/constants/counterpartyDonutColors";
import type { CounterpartySpendRow } from "@/features/analytics/types";
import {
  buildCounterpartyDonutData,
  type CounterpartyDonutDatum,
} from "@/features/analytics/utils/buildCounterpartyDonutData";
import { formatPayeeShare } from "@/features/analytics/utils/formatPayeeShare";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";
import { formatInrCompact } from "@/utils/currency";

import { useChartInViewport } from "@/features/analytics/hooks/useChartInViewport";
import { usePieClockwiseEntry } from "@/features/analytics/hooks/usePieClockwiseEntry";

import { ClockwiseAnimatedPie } from "./ClockwiseAnimatedPie";
import { InsightsDonutCardSkeleton } from "./InsightsAnalyticsSkeletons";
import { InsightsCard } from "./InsightsCard";
import { PayeeDonutLegendList } from "./PayeeDonutLegendList";
import { PayeeDonutPressable } from "./PayeeDonutPressable";

const CONTENT_MIN_HEIGHT = 240;
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
    <EmptyState
      layout="inset"
      headline={emptyStateCopy.analyticsCounterparty.headline}
      subtext={emptyStateCopy.analyticsCounterparty.subtext}
    />
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
    const { colors } = useTheme();
    const chartData = useMemo(
      () => buildCounterpartyDonutData(counterpartySpend, colors.donut),
      [counterpartySpend, colors.donut],
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
            : "View transactions",
        onPress: handleTooltipViewPress,
      };
    }, [handleTooltipViewPress, tooltipPayee]);

    const handleLegendPress = useCallback(
      (slice: CounterpartyDonutDatum, anchor: ChartTooltipAnchor) => {
        void triggerHaptic();
        openTooltip(slice, anchor);
      },
      [openTooltip],
    );

    return (
      <>
        <InsightsCard
          kicker="WHO YOU PAID"
          subtitle="Debit spending by payee this month · Excludes recurring costs"
        >
          <View style={styles.body}>
            {chartLoading ? (
              <InsightsDonutCardSkeleton />
            ) : !hasSpend ? (
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

                  <PayeeDonutLegendList
                    slices={chartData}
                    onSlicePress={handleLegendPress}
                  />
                </View>
              </View>
            )}
          </View>
        </InsightsCard>

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

const styles = StyleSheet.create({
  body: {
    width: "100%",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    minHeight: CONTENT_MIN_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  contentRow: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    minHeight: CONTENT_MIN_HEIGHT - spacing.md - spacing.lg,
  },
  donutLegendCluster: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    maxWidth: "100%",
  },
});
