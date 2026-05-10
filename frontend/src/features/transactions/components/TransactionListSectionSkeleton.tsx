import { StyleSheet, Text, View } from "react-native";

import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { colors, spacing, typography } from "@/constants/theme";

import { TransactionListRowSkeleton } from "./TransactionListRowSkeleton";

type TransactionListSectionSkeletonProps = {
  title?: string;
  rows?: number;
};

export function TransactionListSectionSkeleton({
  title = "Today",
  rows = 2,
}: TransactionListSectionSkeletonProps) {
  return (
    <View style={styles.root}>
      <View style={styles.dateHeader}>
        <Text style={styles.dateLabel}>{title.toUpperCase()}</Text>
        <View style={styles.dateLine} />
        <SkeletonBlock tone="surface" style={styles.totalSkeleton} />
      </View>
      {Array.from({ length: rows }).map((_, index) => (
        <TransactionListRowSkeleton
          key={`transaction-list-skeleton-${index}`}
          variant="screen"
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  dateHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  dateLabel: {
    fontFamily: typography.screenTitle.fontFamily,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textSecondary,
  },
  dateLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderLight,
  },
  totalSkeleton: {
    width: 72,
    height: 14,
    borderRadius: 6,
  },
});
