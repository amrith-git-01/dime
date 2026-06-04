import { memo, useMemo } from "react";
import {
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { bento, charts, colors, shadows, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";

import type { BentoStatCellTone } from "./BentoStatCell";

export type ChartPressTooltipRow = {
  label: string;
  value: string;
  tone?: BentoStatCellTone;
};

/** Window coordinates of the tapped chart column. */
export type ChartTooltipAnchor = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ChartPressTooltipProps = {
  title: string;
  rows: ChartPressTooltipRow[];
  anchor: ChartTooltipAnchor;
  viewportWidth?: number;
  viewportHeight?: number;
  width?: number;
  gap?: number;
};

export type ChartTooltipOverlayProps = {
  visible: boolean;
  onDismiss: () => void;
  title: string;
  rows: ChartPressTooltipRow[];
  anchor: ChartTooltipAnchor | null;
  width?: number;
};

const DEFAULT_WIDTH = 148;
const ANCHOR_GAP = 8;
const SCREEN_INSET = 12;
const ESTIMATED_ROW_HEIGHT = 17;

function toneStyle(tone: BentoStatCellTone | undefined) {
  if (tone === "credit" || tone === "net-positive") {
    return styles.valueCredit;
  }
  if (tone === "debit" || tone === "net-negative") {
    return styles.valueDebit;
  }
  return null;
}

export function computeChartTooltipPosition(
  anchor: ChartTooltipAnchor,
  viewportWidth: number,
  viewportHeight: number,
  tooltipWidth: number = DEFAULT_WIDTH,
  gap: number = ANCHOR_GAP,
  rowCount: number = 3,
): { left: number; top: number; placement: "left" | "right" } {
  const estimatedHeight = 36 + Math.max(0, rowCount) * ESTIMATED_ROW_HEIGHT;
  const anchorCenterX = anchor.x + anchor.width / 2;
  const placeOnRight = anchorCenterX < viewportWidth / 2;

  let left = placeOnRight
    ? anchor.x + anchor.width + gap
    : anchor.x - tooltipWidth - gap;

  left = Math.max(
    SCREEN_INSET,
    Math.min(left, viewportWidth - tooltipWidth - SCREEN_INSET),
  );

  let top = anchor.y + anchor.height / 2 - estimatedHeight / 2;
  top = Math.max(
    SCREEN_INSET,
    Math.min(top, viewportHeight - estimatedHeight - SCREEN_INSET),
  );

  return { left, top, placement: placeOnRight ? "right" : "left" };
}

export const ChartPressTooltip = memo(function ChartPressTooltip({
  title,
  rows,
  anchor,
  viewportWidth = Dimensions.get("window").width,
  viewportHeight = Dimensions.get("window").height,
  width = DEFAULT_WIDTH,
  gap = ANCHOR_GAP,
}: ChartPressTooltipProps) {
  const { left, top } = useMemo(
    () =>
      computeChartTooltipPosition(
        anchor,
        viewportWidth,
        viewportHeight,
        width,
        gap,
        rows.length,
      ),
    [anchor, gap, rows.length, viewportHeight, viewportWidth, width],
  );

  if (rows.length === 0) {
    return null;
  }

  return (
    <View
      pointerEvents="none"
      style={[styles.tooltipRoot, { left, top, width }]}
      accessibilityRole="text"
      accessibilityLabel={`${title}. ${rows.map((r) => `${r.label} ${r.value}`).join(". ")}`}
    >
      <View style={[styles.card, shadows.cardElevated]}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {rows.map((row) => (
          <View key={row.label} style={styles.row}>
            <Text style={styles.rowLabel}>{row.label}</Text>
            <Text
              style={[styles.rowValue, toneStyle(row.tone)]}
              numberOfLines={1}
            >
              {row.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
});

/** Full-screen scrim + tooltip anchored beside the tapped chart column. */
export const ChartTooltipOverlay = memo(function ChartTooltipOverlay({
  visible,
  onDismiss,
  title,
  rows,
  anchor,
  width = DEFAULT_WIDTH,
}: ChartTooltipOverlayProps) {
  if (!visible || anchor == null || rows.length === 0) {
    return null;
  }

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <View style={styles.overlayRoot}>
        <Pressable
          style={[StyleSheet.absoluteFill, styles.scrim]}
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss chart details"
        />
        <ChartPressTooltip
          title={title}
          rows={rows}
          anchor={anchor}
          width={width}
        />
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlayRoot: {
    flex: 1,
  },
  scrim: {
    backgroundColor: charts.tooltipScrim,
  },
  tooltipRoot: {
    position: "absolute",
    zIndex: 2,
  },
  card: {
    backgroundColor: colors.barBackground,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderList,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: 4,
  },
  title: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 11,
    lineHeight: 14,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  rowLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 9,
    lineHeight: 12,
    color: bento.onPastel.muted,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  rowValue: {
    flexShrink: 1,
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 10,
    lineHeight: 13,
    color: colors.textPrimary,
    textAlign: "right",
  },
  valueCredit: {
    color: colors.success,
  },
  valueDebit: {
    color: colors.danger,
  },
});
