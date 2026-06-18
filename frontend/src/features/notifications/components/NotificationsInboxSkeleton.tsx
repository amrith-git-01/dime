import { StyleSheet, View } from "react-native";

import { NotificationBentoRowSkeleton } from "@/components/notifications/NotificationBentoRowSkeleton";
import { SkeletonBlock } from "@/components/ui";
import { radius, spacing } from "@/constants";

const FILTER_TAB_COUNT = 3;
const ROW_COUNT = 3;

/**
 * Shape-matched loading skeleton for the notifications inbox (tabs + card list).
 */
export function NotificationsInboxSkeleton() {
  return (
    <View style={styles.root}>
      <View style={styles.tabs}>
        {Array.from({ length: FILTER_TAB_COUNT }, (_, index) => (
          <SkeletonBlock key={index} tone="surface" style={styles.tabChip} />
        ))}
      </View>

      <View style={styles.section}>
        <SkeletonBlock tone="surface" style={styles.sectionTitle} />
        {Array.from({ length: ROW_COUNT }, (_, index) => (
          <NotificationBentoRowSkeleton key={index} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexGrow: 1,
    gap: spacing.md,
  },
  tabs: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  tabChip: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.sm,
  },
  section: {
    gap: spacing.md,
  },
  sectionTitle: {
    width: 56,
    height: 12,
    borderRadius: radius.sm,
  },
});
