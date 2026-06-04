import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MutableRefObject,
} from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  ChartTooltipOverlay,
  TwoToneCard,
  type ChartPressTooltipRow,
  type ChartTooltipAnchor,
} from "@/components/shared";
import { bento, colors, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { COUNTERPARTY_DONUT_OTHER_COLOR } from "@/features/analytics/constants/counterpartyDonutColors";
import type { CounterpartySpendRow } from "@/features/analytics/types";
import {
  buildCounterpartyDonutData,
  type CounterpartyDonutDatum,
} from "@/features/analytics/utils/buildCounterpartyDonutData";
import { triggerLightHaptic } from "@/lib/haptics/nativeHaptics";
import { formatInrCompact } from "@/utils/currency";

import { InsightsDonutCardSkeleton } from "./InsightsAnalyticsSkeletons";
import { PayeeDonutChart } from "./PayeeDonutChart";

const CHART_SIZE = 192;
const LEGEND_WIDTH = 168;
const CONTENT_MIN_HEIGHT = 228;
const TOOLTIP_WIDTH = 168;
const EMPTY_LEGEND_ROWS = 4;
const EM_DASH = "\u2014";

export type InsightsCounterpartyDonutCardProps = {
  counterpartySpend: CounterpartySpendRow[];
  loading?: boolean;
  tooltipDismissRef?: MutableRefObject<(() => void) | null>;
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

const EmptyDonutLayout = memo(function EmptyDonutLayout() {
  return (
    <View style={styles.contentRow}>
      <View style={styles.chartColumn}>
        <View style={styles.emptyRing} />
        <View style={styles.chartCenter} pointerEvents="none">
          <Text style={styles.centerLabel}>{EM_DASH}</Text>
          <Text style={styles.centerMeta}>{EM_DASH}</Text>
        </View>
      </View>
      <View style={styles.legend}>
        {Array.from({ length: EMPTY_LEGEND_ROWS }, (_, index) => (
          <View key={index} style={styles.legendRow}>
            <View
              style={[
                styles.legendSwatch,
                { backgroundColor: COUNTERPARTY_DONUT_OTHER_COLOR },
              ]}
            />
            <View style={styles.legendTextCol}>
              <Text style={styles.legendName}>{EM_DASH}</Text>
              <Text style={styles.legendMeta}>
                {EM_DASH} · {EM_DASH}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
});

export const InsightsCounterpartyDonutCard = memo(
  function InsightsCounterpartyDonutCard({
    counterpartySpend,
    loading = false,
    tooltipDismissRef,
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
        void triggerLightHaptic();
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

    const topSlice = chartData[0];

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
                  <View style={styles.chartColumn}>
                    <PayeeDonutChart
                      data={chartData}
                      size={CHART_SIZE}
                      innerRadiusRatio={0.56}
                      onSlicePress={handleDonutSlicePress}
                    />
                    {topSlice ? (
                      <View style={styles.chartCenter} pointerEvents="none">
                        <Text style={styles.centerLabel} numberOfLines={1}>
                          {topSlice.display_name}
                        </Text>
                        <Text style={styles.centerMeta}>
                          {formatPayeeShare(topSlice.share)}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.legend}>
                    {chartData.map((slice) => (
                      <LegendRow key={slice.payee_key} slice={slice} />
                    ))}
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
        />
      </>
    );
  },
);

type LegendRowProps = {
  slice: CounterpartyDonutDatum;
};

const LegendRow = memo(function LegendRow({ slice }: LegendRowProps) {
  return (
    <View
      style={styles.legendRow}
      accessibilityRole="text"
      accessibilityLabel={`${slice.display_name}, ${formatPayeeShare(slice.share)} of spending`}
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
    </View>
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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    minHeight: CONTENT_MIN_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    gap: spacing.lg,
    width: "100%",
    maxWidth: CHART_SIZE + LEGEND_WIDTH + spacing.lg,
    minHeight: CONTENT_MIN_HEIGHT - spacing.sm - spacing.lg,
  },
  chartColumn: {
    width: CHART_SIZE,
    height: CHART_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyRing: {
    width: CHART_SIZE,
    height: CHART_SIZE,
    borderRadius: CHART_SIZE / 2,
    borderWidth: 28,
    borderColor: COUNTERPARTY_DONUT_OTHER_COLOR,
    opacity: 0.45,
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
  legend: {
    width: LEGEND_WIDTH,
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
  legendSwatch: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendTextCol: {
    flex: 1,
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
