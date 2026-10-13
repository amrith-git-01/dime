import { memo } from "react";
import { View } from "react-native";

import { SkeletonBlock } from "@/components/ui";
import { radius, spacing } from "@/constants";
import { NOTIFICATION_ICON_WELL_SIZE } from "@/features/notifications/notificationBentoTokens";
import { createThemedStyles } from "@/theme";

export const NotificationBentoRowSkeleton = memo(
  function NotificationBentoRowSkeleton() {
    const styles = useStyles();
    return (
      <View style={styles.shadowWrap}>
        <View style={styles.card}>
          <SkeletonBlock tone="surface" style={styles.iconWell} />
          <View style={styles.textCol}>
            <SkeletonBlock tone="surface" style={styles.title} />
            <SkeletonBlock tone="surface" style={styles.body} />
            <SkeletonBlock tone="surface" style={styles.time} />
          </View>
        </View>
      </View>
    );
  },
);

const useStyles = createThemedStyles(({ colors, shadows }) => ({
  shadowWrap: {
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
  },
  iconWell: {
    width: NOTIFICATION_ICON_WELL_SIZE,
    height: NOTIFICATION_ICON_WELL_SIZE,
    borderRadius: radius.sm,
    flexShrink: 0,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  title: {
    width: "78%",
    height: 15,
    borderRadius: radius.sm,
  },
  body: {
    width: "92%",
    height: 12,
    borderRadius: radius.sm,
  },
  time: {
    width: 48,
    height: 12,
    borderRadius: radius.sm,
  },
}));
