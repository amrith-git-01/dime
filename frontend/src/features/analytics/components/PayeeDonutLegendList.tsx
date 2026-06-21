import { memo, useCallback, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { ChartTooltipAnchor } from "@/components/shared";
import { ink, inkSoft, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import type { CounterpartyDonutDatum } from "@/features/analytics/utils/buildCounterpartyDonutData";
import { formatPayeeShare } from "@/features/analytics/utils/formatPayeeShare";
import { formatInrCompact } from "@/utils/currency";

export const PAYEE_DONUT_LEGEND_MAX_WIDTH = 168;

type PayeeDonutLegendListProps = {
  slices: CounterpartyDonutDatum[];
  onSlicePress?: (
    slice: CounterpartyDonutDatum,
    anchor: ChartTooltipAnchor,
  ) => void;
};

export const PayeeDonutLegendList = memo(function PayeeDonutLegendList({
  slices,
  onSlicePress,
}: PayeeDonutLegendListProps) {
  return (
    <View style={styles.list}>
      {slices.map((slice) => (
        <LegendRow key={slice.payee_key} slice={slice} onPress={onSlicePress} />
      ))}
    </View>
  );
});

type LegendRowProps = {
  slice: CounterpartyDonutDatum;
  onPress?: (slice: CounterpartyDonutDatum, anchor: ChartTooltipAnchor) => void;
};

const LegendRow = memo(function LegendRow({ slice, onPress }: LegendRowProps) {
  const rowRef = useRef<View>(null);

  const handlePress = useCallback(() => {
    if (!onPress) {
      return;
    }
    rowRef.current?.measureInWindow((x, y, width, height) => {
      onPress(slice, { x, y, width, height });
    });
  }, [onPress, slice]);

  const content = (
    <View ref={rowRef} collapsable={false} style={styles.rowInner}>
      <View style={[styles.swatch, { backgroundColor: slice.color }]} />
      <View style={styles.textCol}>
        <Text style={styles.name} numberOfLines={1}>
          {slice.display_name}
        </Text>
        <Text style={styles.meta}>
          {formatPayeeShare(slice.share)} ·{" "}
          {formatInrCompact(slice.debit_total)}
        </Text>
      </View>
    </View>
  );

  if (!onPress) {
    return <View style={styles.row}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View details for ${slice.display_name}`}
      onPress={handlePress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      {content}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  list: {
    flexShrink: 1,
    maxWidth: PAYEE_DONUT_LEGEND_MAX_WIDTH,
    gap: 8,
  },
  row: {
    borderRadius: 8,
  },
  rowInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: 5,
    paddingHorizontal: spacing.xs,
  },
  rowPressed: {
    opacity: 0.88,
  },
  swatch: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  textCol: {
    flexShrink: 1,
    minWidth: 0,
  },
  name: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
    color: ink,
  },
  meta: {
    marginTop: 1,
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 10,
    lineHeight: 13,
    color: inkSoft,
  },
});
