import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { bento, colors, shadows, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";

import type { BentoStatCellTone } from "./BentoStatCell";

export type ChartPressTooltipRow = {
  label: string;
  value: string;
  tone?: BentoStatCellTone;
};

export type ChartPressTooltipProps = {
  visible: boolean;
  title: string;
  rows: ChartPressTooltipRow[];
  /** Center X within the positioning parent (chart plot). */
  anchorX: number;
  parentWidth: number;
  /** Width of the tooltip card — used for horizontal clamping. */
  width?: number;
};

const DEFAULT_WIDTH = 148;
const HORIZONTAL_INSET = 6;

export type ChartTooltipScrimProps = {
  visible: boolean;
  onDismiss: () => void;
};

/** Light dim overlay; tap to dismiss an open chart tooltip. */
export const ChartTooltipScrim = memo(function ChartTooltipScrim({
  visible,
  onDismiss,
}: ChartTooltipScrimProps) {
  if (!visible) {
    return null;
  }

  return (
    <Pressable
      style={[StyleSheet.absoluteFill, styles.scrim]}
      onPress={onDismiss}
      accessibilityRole="button"
      accessibilityLabel="Dismiss chart details"
    />
  );
});

function toneStyle(tone: BentoStatCellTone | undefined) {
  if (tone === "credit" || tone === "net-positive") {
    return styles.valueCredit;
  }
  if (tone === "debit" || tone === "net-negative") {
    return styles.valueDebit;
  }
  return null;
}

function clampAnchorX(
  anchorX: number,
  parentWidth: number,
  tooltipWidth: number,
): number {
  const half = tooltipWidth / 2;
  const min = HORIZONTAL_INSET + half;
  const max = parentWidth - HORIZONTAL_INSET - half;
  if (max <= min) {
    return parentWidth / 2;
  }
  return Math.min(Math.max(anchorX, min), max);
}

export const ChartPressTooltip = memo(function ChartPressTooltip({
  visible,
  title,
  rows,
  anchorX,
  parentWidth,
  width = DEFAULT_WIDTH,
}: ChartPressTooltipProps) {
  if (!visible || rows.length === 0) {
    return null;
  }

  const left = clampAnchorX(anchorX, parentWidth, width) - width / 2;

  return (
    <View
      pointerEvents="none"
      style={[styles.root, { left, width }]}
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

const styles = StyleSheet.create({
  scrim: {
    backgroundColor: "rgba(10, 10, 31, 0.06)",
    zIndex: 1,
  },
  root: {
    position: "absolute",
    top: 4,
    zIndex: 3,
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
