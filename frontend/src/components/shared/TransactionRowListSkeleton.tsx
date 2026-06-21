import { StyleSheet, View } from "react-native";

import { SkeletonBlock, SkeletonStrip } from "@/components/ui";
import { line, radius, spacing } from "@/constants";

type TransactionRowListSkeletonProps = {
  rowCount?: number;
  /** Left inset for hairline dividers (icon + gap from row start). */
  dividerInset?: number;
};

/**
 * Flat transaction-row placeholders matching TransactionRow layout.
 * Shared by Analytics top expenses and similar list cards.
 */
export function TransactionRowListSkeleton({
  rowCount = 5,
  dividerInset = spacing.lg + 40 + spacing.md,
}: TransactionRowListSkeletonProps) {
  return (
    <View>
      {Array.from({ length: rowCount }, (_, i) => (
        <View key={i}>
          {i > 0 && (
            <View style={[styles.divider, { marginLeft: dividerInset }]} />
          )}
          <View style={styles.row}>
            <SkeletonBlock tone="surface" style={styles.icon} />
            <View style={styles.meta}>
              <SkeletonStrip variant="listTitle" />
              <SkeletonStrip variant="listMeta" />
            </View>
            <SkeletonBlock tone="surface" style={styles.amount} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    flexShrink: 0,
  },
  meta: {
    flex: 1,
    gap: 2,
  },
  amount: {
    width: 52,
    height: 14,
    borderRadius: radius.sm,
    flexShrink: 0,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: line,
  },
});
