import { memo } from "react";
import { StyleSheet, View } from "react-native";

import { BENTO_TRANSACTION_TILE_MIN_HEIGHT } from "@/components/bento";
import { SkeletonBlock, SkeletonStrip } from "@/components/ui";
import { colors, radius, spacing } from "@/constants";

/** Single recent-transaction row placeholder inside {@link BentoSectionCard}. */
export const HomeRecentTransactionRowSkeleton = memo(
  function HomeRecentTransactionRowSkeleton() {
    return (
      <View style={styles.row}>
        <SkeletonBlock tone="surface" style={styles.icon} />
        <View style={styles.text}>
          <SkeletonStrip variant="listTitle" />
          <SkeletonStrip variant="listMeta" />
        </View>
        <SkeletonStrip variant="listAmount" />
      </View>
    );
  },
);

const ICON = 38;

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.barBackground,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
    minHeight: BENTO_TRANSACTION_TILE_MIN_HEIGHT,
  },
  icon: {
    width: ICON,
    height: ICON,
    borderRadius: radius.sm,
    flexShrink: 0,
  },
  text: {
    flex: 1,
    gap: spacing.xs,
  },
});
