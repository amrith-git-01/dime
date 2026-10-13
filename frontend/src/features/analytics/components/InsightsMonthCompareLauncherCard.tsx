import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import {
  areCompareMonthsEqual,
  defaultCompareMonthBIndex,
  monthOptionToCompareParam,
  type CompareMonthParam,
} from "@/features/analytics/utils/compareMonths";
import type { MonthOption } from "@/utils/buildMonthOptions";
import { createThemedStyles, useTheme } from "@/theme";

export type InsightsMonthCompareLauncherCardProps = {
  monthOptions: MonthOption[];
  insightsSelectedMonthIndex: number;
  onCompare: (monthA: CompareMonthParam, monthB: CompareMonthParam) => void;
};

const BAR_HEIGHT = 60;
const BAR_MAX_HEIGHT = 60;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export const InsightsMonthCompareLauncherCard = memo(
  function InsightsMonthCompareLauncherCard({
    monthOptions,
    insightsSelectedMonthIndex,
    onCompare,
  }: InsightsMonthCompareLauncherCardProps) {
    const { colors } = useTheme();
    const styles = useStyles();
    const [monthAIndex, setMonthAIndex] = useState(insightsSelectedMonthIndex);
    const [monthBIndex, setMonthBIndex] = useState(() =>
      defaultCompareMonthBIndex(monthOptions, insightsSelectedMonthIndex),
    );

    useEffect(() => {
      setMonthAIndex(insightsSelectedMonthIndex);
      setMonthBIndex(
        defaultCompareMonthBIndex(monthOptions, insightsSelectedMonthIndex),
      );
    }, [insightsSelectedMonthIndex, monthOptions]);

    const monthA = monthOptions[monthAIndex] ?? monthOptions[0];
    const monthB = monthOptions[monthBIndex] ?? monthOptions[0];

    const compareDisabled = useMemo(() => {
      if (!monthA || !monthB) return true;
      return areCompareMonthsEqual(
        monthOptionToCompareParam(monthA),
        monthOptionToCompareParam(monthB),
      );
    }, [monthA, monthB]);

    const handleCompare = useCallback(() => {
      if (!monthA || !monthB || compareDisabled) return;
      onCompare(
        monthOptionToCompareParam(monthA),
        monthOptionToCompareParam(monthB),
      );
    }, [compareDisabled, monthA, monthB, onCompare]);

    const goPrevMonthA = useCallback(() => {
      setMonthAIndex((prev) => clamp(prev + 1, 0, monthOptions.length - 1));
    }, [monthOptions.length]);

    const goNextMonthA = useCallback(() => {
      setMonthAIndex((prev) => clamp(prev - 1, 0, monthOptions.length - 1));
    }, [monthOptions.length]);

    const goPrevMonthB = useCallback(() => {
      setMonthBIndex((prev) => clamp(prev + 1, 0, monthOptions.length - 1));
    }, [monthOptions.length]);

    const goNextMonthB = useCallback(() => {
      setMonthBIndex((prev) => clamp(prev - 1, 0, monthOptions.length - 1));
    }, [monthOptions.length]);

    const canGoPrevA = monthAIndex < monthOptions.length - 1;
    const canGoNextA = monthAIndex > 0;
    const canGoPrevB = monthBIndex < monthOptions.length - 1;
    const canGoNextB = monthBIndex > 0;

    return (
      <View style={styles.card}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.kicker}>COMPARE MONTHS</Text>
          <Text style={styles.subtitle}>Stack two months side by side</Text>
        </View>

        <View style={styles.divider} />

        {/* Mini preview bars */}
        <View style={styles.previewSection}>
          <View style={styles.barsContainer}>
            {/* Month B bar (comparison, gray) */}
            <View style={styles.barColumn}>
              <Text style={styles.barMonthLabel}>{monthB?.label ?? ""}</Text>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    styles.barFillGray,
                    { height: BAR_MAX_HEIGHT },
                  ]}
                />
              </View>
            </View>

            {/* Month A bar (current, accent) */}
            <View style={styles.barColumn}>
              <Text style={styles.barMonthLabel}>{monthA?.label ?? ""}</Text>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    styles.barFillAccent,
                    { height: BAR_HEIGHT },
                  ]}
                />
              </View>
            </View>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Month selectors */}
        <View style={styles.selectorsSection}>
          <MonthArrowSelector
            label={monthB?.label ?? ""}
            canGoPrev={canGoPrevB}
            canGoNext={canGoNextB}
            onPrev={goPrevMonthB}
            onNext={goNextMonthB}
          />
          <Text style={styles.vsLabel}>vs</Text>
          <MonthArrowSelector
            label={monthA?.label ?? ""}
            canGoPrev={canGoPrevA}
            canGoNext={canGoNextA}
            onPrev={goPrevMonthA}
            onNext={goNextMonthA}
          />
        </View>

        {/* CTA */}
        <View style={styles.ctaSection}>
          <Pressable
            onPress={handleCompare}
            disabled={compareDisabled}
            style={[styles.ctaButton, compareDisabled && styles.ctaDisabled]}
            accessibilityRole="button"
          >
            <Text
              style={[
                styles.ctaLabel,
                compareDisabled && styles.ctaLabelDisabled,
              ]}
            >
              View full comparison
            </Text>
            <ChevronRight
              size={18}
              color={compareDisabled ? colors.inkFaint : colors.onAccent}
              strokeWidth={2}
            />
          </Pressable>
        </View>
      </View>
    );
  },
);

type MonthArrowSelectorProps = {
  label: string;
  canGoPrev: boolean;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
};

function MonthArrowSelector({
  label,
  canGoPrev,
  canGoNext,
  onPrev,
  onNext,
}: MonthArrowSelectorProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.selectorRow}>
      <Pressable
        onPress={onPrev}
        disabled={!canGoPrev}
        hitSlop={8}
        style={styles.navBtn}
        accessibilityRole="button"
        accessibilityLabel="Previous month"
      >
        <ChevronLeft
          size={16}
          color={canGoPrev ? colors.inkSoft : colors.inkFaint}
          strokeWidth={2}
        />
      </Pressable>
      <Text style={styles.selectorLabel}>{label}</Text>
      <Pressable
        onPress={onNext}
        disabled={!canGoNext}
        hitSlop={8}
        style={styles.navBtn}
        accessibilityRole="button"
        accessibilityLabel="Next month"
      >
        <ChevronRight
          size={16}
          color={canGoNext ? colors.inkSoft : colors.inkFaint}
          strokeWidth={2}
        />
      </Pressable>
    </View>
  );
}

const useStyles = createThemedStyles(({ colors, shadows }) => ({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    ...shadows.card,
    overflow: "hidden",
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: 2,
  },
  kicker: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 10,
    lineHeight: 14,
    color: colors.inkSoft,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  subtitle: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkFaint,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
    marginHorizontal: spacing.lg,
  },
  previewSection: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    alignItems: "center",
  },
  barsContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.xl,
    justifyContent: "center",
  },
  barColumn: {
    alignItems: "center",
    gap: spacing.xs,
  },
  barMonthLabel: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 10,
    lineHeight: 14,
    color: colors.inkSoft,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  barTrack: {
    width: 48,
    justifyContent: "flex-end",
  },
  barFill: {
    width: 48,
    borderRadius: radius.sm,
  },
  barFillGray: {
    backgroundColor: colors.surfaceSunken,
  },
  barFillAccent: {
    backgroundColor: colors.accent,
    opacity: 0.85,
  },
  selectorsSection: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  selectorRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
    gap: 2,
  },
  navBtn: {
    padding: spacing.xs,
  },
  selectorLabel: {
    flex: 1,
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.ink,
    textAlign: "center",
  },
  vsLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkSoft,
    flexShrink: 0,
  },
  ctaSection: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.xs,
  },
  ctaButton: {
    flexDirection: "row",
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  ctaDisabled: {
    backgroundColor: colors.accentTint,
  },
  ctaLabel: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 14,
    lineHeight: 20,
    color: colors.onAccent,
  },
  ctaLabelDisabled: {
    color: colors.inkFaint,
  },
}));
