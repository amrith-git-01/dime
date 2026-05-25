import { format, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { fontFamilies } from "@/constants/fonts";
import { colors, spacing } from "@/constants/theme";

export type TransactionDayNavigatorProps = {
  dayKey: string;
  transactionCount: number;
  canGoPrev: boolean;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
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

export const TransactionDayNavigator = memo(function TransactionDayNavigator({
  dayKey,
  transactionCount,
  canGoPrev,
  canGoNext,
  onPrev,
  onNext,
}: TransactionDayNavigatorProps) {
  return (
    <View style={styles.pill}>
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
        <ChevronLeft size={24} color={colors.textOnPrimary} strokeWidth={2} />
      </Pressable>

      <View style={styles.center}>
        <Text style={styles.title} numberOfLines={1}>
          {formatDayTitle(dayKey)}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {transactionCountLabel(transactionCount)}
        </Text>
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
        <ChevronRight size={24} color={colors.textOnPrimary} strokeWidth={2} />
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: 20,
    backgroundColor: colors.headerGradientStart,
    borderWidth: 1,
    borderColor: colors.onPrimaryHairline,
    gap: spacing.xs,
  },
  chevronHit: {
    padding: spacing.sm,
    borderRadius: 12,
  },
  chevronDisabled: {
    opacity: 0.4,
  },
  chevronPressed: {
    opacity: 0.85,
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
    color: colors.textOnPrimary,
    textAlign: "center",
  },
  subtitle: {
    marginTop: 2,
    fontFamily: fontFamilies.medium,
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 0.4,
    color: colors.textOnPrimary,
    textAlign: "center",
  },
});
