import { StyleSheet, View } from "react-native";

import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { spacing } from "@/constants/theme";

type TransactionListRowSkeletonProps = {
  variant?: "screen" | "card";
  showBottomBorder?: boolean;
};

export function TransactionListRowSkeleton({
  variant = "screen",
  showBottomBorder = true,
}: TransactionListRowSkeletonProps) {
  if (variant === "card") {
    return (
      <View
        style={[
          styles.cardRow,
          !showBottomBorder && styles.cardRowLast,
        ]}
      >
        <SkeletonBlock
          tone="surface"
          style={styles.categoryIconSkeleton}
        />
        <View style={styles.transactionBody}>
          <View style={styles.line1}>
            <SkeletonBlock
              tone="surface"
              style={styles.merchantNameSkeleton}
            />
            <SkeletonBlock
              tone="surface"
              style={styles.timeSkeleton}
            />
          </View>
          <View style={styles.line2}>
            <SkeletonBlock
              tone="surface"
              style={styles.categoryTagSkeleton}
            />
            <SkeletonBlock
              tone="surface"
              style={styles.amountSkeleton}
            />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screenRow}>
      <SkeletonBlock
        tone="surface"
        style={styles.categoryIconSkeleton}
      />
      <View style={styles.transactionBody}>
        <View style={styles.line1}>
          <SkeletonBlock
            tone="surface"
            style={styles.merchantNameSkeleton}
          />
          <SkeletonBlock
            tone="surface"
            style={styles.timeSkeleton}
          />
        </View>
        <View style={styles.line2}>
          <SkeletonBlock
            tone="surface"
            style={styles.categoryTagSkeleton}
          />
          <SkeletonBlock
            tone="surface"
            style={styles.amountSkeleton}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screenRow: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
  },
  cardRow: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#EEEEFF",
  },
  cardRowLast: {
    borderBottomWidth: 0,
  },
  categoryIconSkeleton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    marginRight: spacing.md,
    flexShrink: 0,
  },
  transactionBody: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  line1: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  line2: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: 4,
  },
  merchantNameSkeleton: {
    flex: 1,
    height: 16,
    borderRadius: 4,
  },
  timeSkeleton: {
    width: 60,
    height: 12,
    borderRadius: 4,
  },
  categoryTagSkeleton: {
    width: 50,
    height: 13,
    borderRadius: 6,
  },
  amountSkeleton: {
    marginLeft: "auto",
    width: 70,
    height: 16,
    borderRadius: 4,
  },
});
