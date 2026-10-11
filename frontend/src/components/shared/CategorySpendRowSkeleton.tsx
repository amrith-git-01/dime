import { StyleSheet, View } from "react-native";

import { SkeletonBlock, SkeletonStrip } from "@/components/ui";
import { radius, spacing } from "@/constants";

const CATEGORY_ICON_SIZE = 46;
const CATEGORY_PROGRESS_WIDTH = 68;

type CategorySpendRowSkeletonProps = {
  /** Matches CategorySpendBentoRow progress track when monthly budget exists. */
  showProgress?: boolean;
};

/**
 * Shape-matched placeholder for CategorySpendBentoRow (budget + home category lists).
 */
export function CategorySpendRowSkeleton({
  showProgress = true,
}: CategorySpendRowSkeletonProps) {
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <SkeletonBlock tone="surface" style={styles.icon} />
        <View style={styles.meta}>
          <SkeletonStrip variant="listTitle" />
          {showProgress ? <SkeletonStrip variant="listMeta" /> : null}
        </View>
      </View>
      <View style={styles.right}>
        <SkeletonStrip variant="listAmount" />
        {showProgress ? (
          <SkeletonBlock tone="surface" style={styles.progress} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    flex: 1,
  },
  icon: {
    width: CATEGORY_ICON_SIZE,
    height: CATEGORY_ICON_SIZE,
    borderRadius: radius.md,
    flexShrink: 0,
  },
  meta: {
    flex: 1,
    gap: 6,
  },
  right: {
    flexShrink: 0,
    alignItems: "flex-end",
    gap: spacing.xs,
  },
  progress: {
    width: CATEGORY_PROGRESS_WIDTH,
    height: 8,
    borderRadius: radius.full,
  },
});

export const CATEGORY_SPEND_ROW_DIVIDER_INSET = CATEGORY_ICON_SIZE + spacing.md;
