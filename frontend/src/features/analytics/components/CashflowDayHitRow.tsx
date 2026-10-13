import { memo, useRef } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { triggerHaptic } from "@/lib/haptics/nativeHaptics";

import type {
  CashflowDayAnchor,
  InsightsCashflowDaySelection,
} from "../hooks/useCashflowDayTooltip";
import { CASHFLOW_DAY_SLOT_WIDTH } from "../utils/buildCashflowWindow";
import { createThemedStyles } from "@/theme";

type CashflowDayHitCellProps = {
  width: number;
  selected: boolean;
  onPress: (anchor: CashflowDayAnchor) => void;
  accessibilityLabel: string;
};

const CashflowDayHitCell = memo(function CashflowDayHitCell({
  width,
  selected,
  onPress,
  accessibilityLabel,
}: CashflowDayHitCellProps) {
  const styles = useStyles();
  const cellRef = useRef<View>(null);

  return (
    <Pressable
      ref={cellRef}
      style={[
        styles.dayHitCell,
        { width },
        selected && styles.dayHitCellSelected,
      ]}
      onPress={() => {
        void triggerHaptic();
        cellRef.current?.measureInWindow((x, y, w, h) => {
          onPress({ x, y, width: w, height: h });
        });
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
    />
  );
});

type CashflowDayHitRowProps = {
  monthDays: InsightsCashflowDaySelection[];
  selectedDay: number | null;
  onDismiss: () => void;
  onDayPress: (
    day: InsightsCashflowDaySelection,
    anchor: CashflowDayAnchor,
  ) => void;
};

/** Transparent tap targets laid over the chart: one per day plus a dismiss slot at each end. */
export function CashflowDayHitRow({
  monthDays,
  selectedDay,
  onDismiss,
  onDayPress,
}: CashflowDayHitRowProps) {
  const styles = useStyles();
  return (
    <View style={styles.dayHitRow} pointerEvents="box-none">
      <Pressable
        style={[styles.dayHitCell, { width: CASHFLOW_DAY_SLOT_WIDTH }]}
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss chart details"
      />
      {monthDays.map((d) => (
        <CashflowDayHitCell
          key={d.date}
          width={CASHFLOW_DAY_SLOT_WIDTH}
          selected={selectedDay === d.day}
          onPress={(anchor) => onDayPress(d, anchor)}
          accessibilityLabel={`Day ${d.day} cash flow`}
        />
      ))}
      <Pressable
        style={[styles.dayHitCell, { width: CASHFLOW_DAY_SLOT_WIDTH }]}
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss chart details"
      />
    </View>
  );
}

const useStyles = createThemedStyles(({ colors }) => ({
  dayHitRow: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    zIndex: 2,
  },
  dayHitCell: {
    height: "100%",
  },
  dayHitCellSelected: {
    backgroundColor: colors.accentTint,
  },
}));
