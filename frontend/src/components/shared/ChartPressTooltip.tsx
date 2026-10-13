import { ChevronRight } from "lucide-react-native";
import { memo, useMemo } from "react";
import {
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";

import type { BentoStatCellTone } from "./BentoStatCell";
import { createThemedStyles, useTheme } from "@/theme";

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

export type ChartTooltipViewAction = {
  label?: string;
  onPress: () => void;
};

export type ChartPressTooltipProps = {
  title: string;
  rows: ChartPressTooltipRow[];
  anchor: ChartTooltipAnchor;
  viewportWidth?: number;
  viewportHeight?: number;
  width?: number;
  gap?: number;
  viewAction?: ChartTooltipViewAction;
};

export type ChartTooltipOverlayProps = {
  visible: boolean;
  onDismiss: () => void;
  title: string;
  rows: ChartPressTooltipRow[];
  anchor: ChartTooltipAnchor | null;
  width?: number;
  viewAction?: ChartTooltipViewAction;
};

const DEFAULT_WIDTH = 168;
const ANCHOR_GAP = 10;
const SCREEN_INSET = 12;
const ESTIMATED_ROW_HEIGHT = 20;
const TITLE_BLOCK_HEIGHT = 18;
const TITLE_DIVIDER_HEIGHT = 1 + spacing.sm * 2;
const VIEW_ACTION_BLOCK_HEIGHT = 36;

function toneStyle(
  tone: BentoStatCellTone | undefined,
  styles: ReturnType<typeof useStyles>,
) {
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
  hasViewAction: boolean = false,
): { left: number; top: number; placement: "left" | "right" } {
  const estimatedHeight =
    spacing.sm +
    TITLE_BLOCK_HEIGHT +
    TITLE_DIVIDER_HEIGHT +
    Math.max(0, rowCount) * ESTIMATED_ROW_HEIGHT +
    spacing.xs +
    (hasViewAction ? VIEW_ACTION_BLOCK_HEIGHT : 0) +
    spacing.sm;

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
  viewAction,
}: ChartPressTooltipProps) {
  const { colors, shadows } = useTheme();
  const styles = useStyles();
  const hasViewAction = viewAction != null;

  const { left, top } = useMemo(
    () =>
      computeChartTooltipPosition(
        anchor,
        viewportWidth,
        viewportHeight,
        width,
        gap,
        rows.length,
        hasViewAction,
      ),
    [
      anchor,
      gap,
      hasViewAction,
      rows.length,
      viewportHeight,
      viewportWidth,
      width,
    ],
  );

  if (rows.length === 0) {
    return null;
  }

  const viewLabel = viewAction?.label ?? "View";

  return (
    <View
      pointerEvents={hasViewAction ? "box-none" : "none"}
      style={[styles.tooltipRoot, { left, top, width }]}
      accessibilityRole="text"
      accessibilityLabel={`${title}. ${rows.map((r) => `${r.label} ${r.value}`).join(". ")}`}
    >
      <View
        pointerEvents={hasViewAction ? "auto" : "none"}
        style={[styles.card, shadows.cardElevated]}
      >
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>

        <View style={styles.titleDivider} />

        <View style={styles.body}>
          {rows.map((row) => (
            <View key={row.label} style={styles.row}>
              <Text style={styles.rowLabel}>{row.label}</Text>
              <Text
                style={[styles.rowValue, toneStyle(row.tone, styles)]}
                numberOfLines={1}
              >
                {row.value}
              </Text>
            </View>
          ))}
        </View>

        {viewAction ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${viewLabel} ${title}`}
            onPress={viewAction.onPress}
            style={({ pressed }) => [
              styles.viewAction,
              pressed && styles.viewActionPressed,
            ]}
          >
            <Text style={styles.viewActionLabel}>{viewLabel}</Text>
            <ChevronRight size={14} color={colors.accentText} strokeWidth={2} />
          </Pressable>
        ) : null}
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
  viewAction,
}: ChartTooltipOverlayProps) {
  const styles = useStyles();
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
          viewAction={viewAction}
        />
      </View>
    </Modal>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  overlayRoot: {
    flex: 1,
  },
  scrim: {
    backgroundColor: colors.overlays.backdrop,
  },
  tooltipRoot: {
    position: "absolute",
    zIndex: 2,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  title: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.ink,
  },
  titleDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
    marginVertical: spacing.sm,
  },
  body: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  rowLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.06 * 11,
    textTransform: "uppercase",
    color: colors.ink,
    opacity: 0.45,
  },
  rowValue: {
    flexShrink: 1,
    fontFamily: fontFamilies.semiBold,
    fontSize: 14,
    lineHeight: 18,
    fontVariant: ["tabular-nums"],
    color: colors.ink,
    textAlign: "right",
  },
  valueCredit: {
    color: colors.success,
  },
  valueDebit: {
    color: colors.danger,
  },
  viewAction: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    marginTop: spacing.sm,
    alignSelf: "stretch",
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.accentTint,
  },
  viewActionPressed: {
    opacity: 0.72,
  },
  viewActionLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.accentText,
  },
}));
