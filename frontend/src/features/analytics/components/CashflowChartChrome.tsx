import { memo } from "react";
import { Text, View } from "react-native";

import { spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { formatInrChartAxis } from "@/utils/currency";

import {
  CASHFLOW_DAY_SLOT_WIDTH,
  formatCashflowXLabel,
  type DailyCashflowDay,
} from "../utils/buildCashflowWindow";
import { createThemedStyles } from "@/theme";

const X_LABEL_ROW_HEIGHT = 22;
const Y_AXIS_GUTTER = 46;

type CashflowYAxisProps = {
  tickValues: number[];
  plotHeight: number;
};

export const CashflowYAxis = memo(function CashflowYAxis({
  tickValues,
  plotHeight,
}: CashflowYAxisProps) {
  const styles = useStyles();
  return (
    <View
      style={[
        styles.yAxisColumn,
        { height: plotHeight },
        tickValues.length === 1 && styles.yAxisColumnOriginOnly,
      ]}
    >
      {[...tickValues].reverse().map((tick) => (
        <Text key={`y-${tick}`} style={styles.yAxisLabel}>
          {formatInrChartAxis(tick)}
        </Text>
      ))}
    </View>
  );
});

type CashflowXLabelsProps = {
  monthDays: DailyCashflowDay[];
  todayDay: number | null;
};

/** Day-number labels under the chart, with an empty slot at each end for the anchors. */
export const CashflowXLabels = memo(function CashflowXLabels({
  monthDays,
  todayDay,
}: CashflowXLabelsProps) {
  const styles = useStyles();
  return (
    <View style={[styles.xLabelsRow, { height: X_LABEL_ROW_HEIGHT }]}>
      <View style={[styles.xLabelCell, { width: CASHFLOW_DAY_SLOT_WIDTH }]} />
      {monthDays.map((d) => {
        const isToday = todayDay != null && d.day === todayDay;
        return (
          <View
            key={d.date}
            style={[styles.xLabelCell, { width: CASHFLOW_DAY_SLOT_WIDTH }]}
          >
            <Text
              style={[styles.xLabelText, isToday && styles.xLabelToday]}
              numberOfLines={1}
            >
              {formatCashflowXLabel(d.day, todayDay)}
            </Text>
          </View>
        );
      })}
      <View style={[styles.xLabelCell, { width: CASHFLOW_DAY_SLOT_WIDTH }]} />
    </View>
  );
});

export const CashflowLegend = memo(function CashflowLegend() {
  const styles = useStyles();
  return (
    <View style={styles.legendRow}>
      <View style={styles.legendItem}>
        <View style={styles.legendBar} />
        <Text style={styles.legendLabel}>Expense</Text>
      </View>
      <View style={styles.legendItem}>
        <View style={styles.legendDot} />
        <Text style={styles.legendLabel}>Income</Text>
      </View>
    </View>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  yAxisColumn: {
    width: Y_AXIS_GUTTER,
    justifyContent: "space-between",
    paddingTop: 10,
    paddingBottom: 4,
    paddingRight: 4,
  },
  yAxisColumnOriginOnly: {
    justifyContent: "flex-end",
    paddingTop: 0,
  },
  yAxisLabel: {
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 8,
    lineHeight: 10,
    color: colors.inkSoft,
    textAlign: "right",
  },
  xLabelsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingTop: 2,
  },
  xLabelCell: {
    alignItems: "center",
    justifyContent: "flex-start",
  },
  xLabelText: {
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 9,
    lineHeight: 12,
    color: colors.inkSoft,
    textAlign: "center",
  },
  xLabelToday: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 8,
    lineHeight: 11,
    color: colors.accentText,
  },
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  legendBar: {
    width: 10,
    height: 10,
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  legendLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 10,
    lineHeight: 13,
    color: colors.inkSoft,
  },
}));
