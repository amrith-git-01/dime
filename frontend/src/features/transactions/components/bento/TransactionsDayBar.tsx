import { format, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import { SkeletonStrip } from "@/components/ui";
import { radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { createThemedStyles, useTheme } from "@/theme";

export type TransactionsDayBarProps = {
  dayKey: string;
  transactionCount: number;
  canGoPrev: boolean;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  isLoading?: boolean;
  isCountLoading?: boolean;
};

function transactionCountLabel(count: number): string {
  if (count === 1) {
    return "1 TRANSACTION";
  }
  return `${count} TRANSACTIONS`;
}

function formatDayTitle(dayKey: string): string {
  return format(parseISO(`${dayKey}T12:00:00`), "MMMM d, yyyy");
}

export const TransactionsDayBar = memo(function TransactionsDayBar({
  dayKey,
  transactionCount,
  canGoPrev,
  canGoNext,
  onPrev,
  onNext,
  isLoading = false,
  isCountLoading = false,
}: TransactionsDayBarProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={[styles.bar, styles.barShadow]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Previous day"
        accessibilityState={{ disabled: !canGoPrev }}
        hitSlop={12}
        disabled={!canGoPrev}
        onPress={onPrev}
        style={({ pressed }) => [
          styles.chevronHit,
          !canGoPrev && styles.chevronDisabled,
          canGoPrev && pressed && styles.chevronPressed,
        ]}
      >
        <ChevronLeft
          size={22}
          color={canGoPrev ? colors.accentText : colors.inkFaint}
          strokeWidth={2}
        />
      </Pressable>

      <View style={styles.center}>
        {isLoading ? (
          <>
            <SkeletonStrip variant="listTitle" style={styles.titleSkeleton} />
            <SkeletonStrip variant="listMeta" style={styles.subtitleSkeleton} />
          </>
        ) : (
          <>
            <Text style={styles.title} numberOfLines={1}>
              {formatDayTitle(dayKey)}
            </Text>
            {isCountLoading ? (
              <SkeletonStrip
                variant="listMeta"
                style={styles.subtitleSkeleton}
              />
            ) : (
              <Text style={styles.subtitle} numberOfLines={1}>
                {transactionCountLabel(transactionCount)}
              </Text>
            )}
          </>
        )}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Next day"
        accessibilityState={{ disabled: !canGoNext }}
        hitSlop={12}
        disabled={!canGoNext}
        onPress={onNext}
        style={({ pressed }) => [
          styles.chevronHit,
          !canGoNext && styles.chevronDisabled,
          canGoNext && pressed && styles.chevronPressed,
        ]}
      >
        <ChevronRight
          size={22}
          color={canGoNext ? colors.accentText : colors.inkFaint}
          strokeWidth={2}
        />
      </Pressable>
    </View>
  );
});

const useStyles = createThemedStyles(({ colors, shadows }) => ({
  barShadow: shadows.tinted,
  bar: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.lg,
    backgroundColor: colors.bento.sectionSurface,
    borderWidth: 1,
    borderColor: colors.line,
    gap: spacing.xs,
  },
  chevronHit: {
    padding: spacing.sm,
    borderRadius: radius.sm,
  },
  chevronDisabled: {
    opacity: 0.45,
  },
  chevronPressed: {
    opacity: 0.75,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
    minHeight: 44,
  },
  title: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    lineHeight: 20,
    color: colors.ink,
    textAlign: "center",
  },
  subtitle: {
    marginTop: 2,
    fontFamily: fontFamilies.medium,
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 0.4,
    color: colors.accentText,
    textAlign: "center",
  },
  titleSkeleton: {
    width: "70%",
  },
  subtitleSkeleton: {
    width: "45%",
    marginTop: 4,
  },
}));
