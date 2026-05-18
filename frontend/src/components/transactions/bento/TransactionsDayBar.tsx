import { format, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { memo } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { fontFamilies } from "@/constants/fonts";
import { bento, colors, radius, spacing } from "@/constants";

export type TransactionsDayBarProps = {
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

export const TransactionsDayBar = memo(function TransactionsDayBar({
  dayKey,
  transactionCount,
  canGoPrev,
  canGoNext,
  onPrev,
  onNext,
}: TransactionsDayBarProps) {
  return (
    <View style={[styles.bar, shadowStyle]}>
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
          color={canGoPrev ? colors.primary : bento.onPastel.muted}
          strokeWidth={2}
        />
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
        <ChevronRight
          size={22}
          color={canGoNext ? colors.primary : bento.onPastel.muted}
          strokeWidth={2}
        />
      </Pressable>
    </View>
  );
});

const shadowStyle = Platform.select({
  android: { elevation: 2 },
  default: {
    shadowColor: bento.surface.lavender,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
});

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.lg,
    backgroundColor: bento.sectionSurface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
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
    color: bento.onPastel.primary,
    textAlign: "center",
  },
  subtitle: {
    marginTop: 2,
    fontFamily: fontFamilies.medium,
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 0.4,
    color: colors.primary,
    textAlign: "center",
  },
});
