import { Edit3 } from "lucide-react-native";
import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { MonthNavigator } from "@/components/shared";
import { AnimatedProgressBar, SkeletonBlock } from "@/components/ui";
import { fontFamilies } from "@/constants/fonts";
import { radius } from "@/constants/radius";
import { spacing } from "@/constants/spacing";
import { createThemedStyles, useTheme } from "@/theme";

import type { CardStat, CategoryMonthView, CompareStat } from "../utils/categoryMonthStats";

export type CategoryMonthCardProps = {
  categoryName: string;
  /** Key for the cap bar's one-time entrance animation (category and month). */
  barKey: string;
  monthLabel: string;
  prevMonthLabel?: string;
  nextMonthLabel?: string;
  canGoPrevMonth: boolean;
  canGoNextMonth: boolean;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  view: CategoryMonthView;
  /** Opens the category editor; omitted where the category cannot be edited (no pencil). */
  onEdit?: () => void;
  /** Opens the category editor to set a cap; omitted where one cannot be set. */
  onSetCap?: () => void;
};

/** A month of one category: the month navigator, what was spent against its cap, and three small stats. */
export const CategoryMonthCard = memo(function CategoryMonthCard({
  categoryName,
  barKey,
  monthLabel,
  prevMonthLabel,
  nextMonthLabel,
  canGoPrevMonth,
  canGoNextMonth,
  onPrevMonth,
  onNextMonth,
  view,
  onEdit,
  onSetCap,
}: CategoryMonthCardProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { cap } = view;
  const capFill =
    cap?.state === "ready"
      ? cap.tone === "danger"
        ? colors.danger
        : cap.tone === "warning"
          ? colors.warning
          : colors.accent
      : colors.accent;

  const renderStat = (stat: CardStat | CompareStat) => {
    const compare = "tone" in stat ? stat : null;
    const color =
      compare?.tone === "danger"
        ? colors.danger
        : compare?.tone === "success"
          ? colors.success
          : colors.ink;
    return (
      <View
        style={styles.stat}
        accessible
        accessibilityLabel={
          compare ? compare.accessibilityLabel : `${stat.label}, ${stat.value ?? "loading"}`
        }
      >
        <Text style={styles.statLabel} numberOfLines={1}>
          {stat.label}
        </Text>
        {stat.value === null ? (
          <SkeletonBlock style={styles.statSkeleton} />
        ) : (
          <Text style={[styles.statValue, { color }]} numberOfLines={1}>
            {stat.value}
          </Text>
        )}
      </View>
    );
  };

  return (
    <View style={styles.card}>
      <MonthNavigator
        label={monthLabel}
        prevLabel={prevMonthLabel}
        nextLabel={nextMonthLabel}
        canGoPrev={canGoPrevMonth}
        canGoNext={canGoNextMonth}
        onPrev={onPrevMonth}
        onNext={onNextMonth}
        containerProps={{ style: styles.monthNav }}
      />

      <View style={styles.eyebrowRow}>
        <Text style={styles.eyebrow}>SPENT</Text>
        {onEdit ? (
          <Pressable
            onPress={onEdit}
            hitSlop={8}
            style={styles.editBtn}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${categoryName}`}
          >
            <Edit3 size={16} color={colors.accentText} strokeWidth={2} />
          </Pressable>
        ) : null}
      </View>

      {view.hero === null ? (
        <SkeletonBlock style={styles.heroSkeleton} />
      ) : (
        <Text
          style={[styles.hero, { color: view.over ? colors.danger : colors.accentText }]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {view.hero}
        </Text>
      )}

      {cap ? (
        cap.state === "loading" ? (
          <View style={styles.capBlock}>
            <SkeletonBlock style={styles.barSkeleton} />
            <SkeletonBlock style={styles.metaSkeleton} />
          </View>
        ) : (
          <View style={styles.capBlock}>
            <AnimatedProgressBar
              progress={cap.progress}
              fillColor={capFill}
              height={8}
              animateOnceKey={barKey}
            />
            <Text
              style={[styles.meta, cap.tone === "danger" && { color: colors.danger }]}
              accessibilityLabel={cap.metaLine}
            >
              {cap.metaLine}
            </Text>
          </View>
        )
      ) : view.offerSetCap && onSetCap ? (
        <Pressable
          onPress={onSetCap}
          style={styles.setCap}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Set a monthly cap"
        >
          <Text style={styles.setCapText}>Set a monthly cap ›</Text>
        </Pressable>
      ) : null}

      {view.paceLine ? <Text style={styles.pace}>{view.paceLine}</Text> : null}

      <View style={styles.statsRow}>
        {renderStat(view.stats.primary)}
        {renderStat(view.stats.payments)}
        {renderStat(view.stats.compare)}
      </View>
    </View>
  );
});

const useStyles = createThemedStyles(({ colors, shadows }) => ({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    ...shadows.card,
  },
  monthNav: {
    marginBottom: spacing.lg,
  },
  eyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 24,
  },
  eyebrow: {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    lineHeight: 14,
    color: colors.inkSoft,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  editBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    marginRight: -spacing.sm,
  },
  hero: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 36,
    lineHeight: 44,
    fontVariant: ["tabular-nums"],
  },
  heroSkeleton: {
    width: 160,
    height: 36,
    marginVertical: spacing.xs,
  },
  capBlock: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  barSkeleton: {
    height: 8,
    borderRadius: radius.full,
  },
  metaSkeleton: {
    width: 190,
    height: 14,
  },
  meta: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
    fontVariant: ["tabular-nums"],
  },
  setCap: {
    alignSelf: "flex-start",
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
  },
  setCapText: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    lineHeight: 20,
    color: colors.accentText,
  },
  pace: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
    fontVariant: ["tabular-nums"],
    marginTop: spacing.xs,
  },
  statsRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  stat: {
    flex: 1,
    gap: spacing.xs,
  },
  statLabel: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkSoft,
  },
  statValue: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    lineHeight: 20,
    fontVariant: ["tabular-nums"],
  },
  statSkeleton: {
    width: 56,
    height: 16,
  },
}));
