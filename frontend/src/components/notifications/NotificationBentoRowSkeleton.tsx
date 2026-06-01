import { memo } from "react";
import { StyleSheet, View } from "react-native";

import { SkeletonBlock } from "@/components/ui";
import { colors, radius, spacing } from "@/constants";
import { NOTIFICATION_ACTION_WELL_SIZE } from "@/features/notifications/notificationBentoTokens";

const ICON_WELL_SIZE = 34;

export type NotificationBentoRowSkeletonProps = {
  showSeparator?: boolean;
};

export const NotificationBentoRowSkeleton = memo(
  function NotificationBentoRowSkeleton({
    showSeparator = false,
  }: NotificationBentoRowSkeletonProps) {
    return (
      <View>
        <View style={styles.row}>
          <SkeletonBlock tone="surface" style={styles.iconWell} />
          <View style={styles.textCol}>
            <SkeletonBlock tone="surface" style={styles.title} />
            <SkeletonBlock tone="surface" style={styles.body} />
            <SkeletonBlock tone="surface" style={styles.time} />
          </View>
          <View style={styles.actions}>
            <SkeletonBlock tone="surface" style={styles.actionWell} />
            <SkeletonBlock tone="surface" style={styles.actionWell} />
          </View>
        </View>
        {showSeparator ? <View style={styles.separator} /> : null}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    minHeight: 44,
    gap: spacing.sm,
  },
  iconWell: {
    width: ICON_WELL_SIZE,
    height: ICON_WELL_SIZE,
    borderRadius: radius.sm,
    flexShrink: 0,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  title: {
    width: "72%",
    height: 13,
    borderRadius: radius.sm,
  },
  body: {
    width: "90%",
    height: 11,
    borderRadius: radius.sm,
  },
  time: {
    width: "28%",
    height: 10,
    borderRadius: radius.sm,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexShrink: 0,
  },
  actionWell: {
    width: NOTIFICATION_ACTION_WELL_SIZE,
    height: NOTIFICATION_ACTION_WELL_SIZE,
    borderRadius: NOTIFICATION_ACTION_WELL_SIZE / 2,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: ICON_WELL_SIZE + spacing.sm,
  },
});
