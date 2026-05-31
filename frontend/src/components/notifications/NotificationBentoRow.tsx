import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { fontFamilies } from "@/constants/fonts";
import { colors, radius, spacing } from "@/constants/theme";
import { NOTIFICATION_ROW_VISUALS } from "@/features/notifications/notificationBentoTokens";
import type { AppNotification } from "@/features/notifications/types";
import { formatNotificationTime } from "@/features/notifications/utils/formatNotificationTime";
import { triggerLightHaptic } from "@/lib/haptics/nativeHaptics";

export type NotificationBentoRowProps = {
  notification: AppNotification;
  unread: boolean;
  onPress: (notification: AppNotification) => void;
  showSeparator?: boolean;
};

const ICON_WELL_SIZE = 44;

export const NotificationBentoRow = memo(function NotificationBentoRow({
  notification,
  unread,
  onPress,
  showSeparator = false,
}: NotificationBentoRowProps) {
  const visual = NOTIFICATION_ROW_VISUALS[notification.kind];
  const Icon = visual.icon;
  const timeLabel = formatNotificationTime(notification.createdAt);

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          void triggerLightHaptic();
          onPress(notification);
        }}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      >
        <View
          style={[styles.iconWell, { backgroundColor: visual.backgroundColor }]}
        >
          <Icon size={22} color={visual.iconColor} strokeWidth={2} />
        </View>

        <View style={styles.textCol}>
          <View style={styles.titleRow}>
            <Text
              style={[styles.title, unread && styles.titleUnread]}
              numberOfLines={2}
            >
              {notification.title}
            </Text>
            {unread ? <View style={styles.unreadDot} /> : null}
          </View>
          <Text style={styles.body} numberOfLines={2}>
            {notification.body}
          </Text>
          <Text style={styles.time}>{timeLabel}</Text>
        </View>
      </Pressable>
      {showSeparator ? <View style={styles.separator} /> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 56,
  },
  rowPressed: {
    opacity: 0.88,
  },
  iconWell: {
    width: ICON_WELL_SIZE,
    height: ICON_WELL_SIZE,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  textCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    fontFamily: fontFamilies.medium,
    fontSize: 15,
    lineHeight: 20,
    color: colors.textPrimary,
  },
  titleUnread: {
    fontFamily: fontFamilies.semiBold,
  },
  body: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  time: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textListSecondary,
    marginTop: 2,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.brandPrimary,
    marginTop: 6,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: ICON_WELL_SIZE + spacing.md,
    marginVertical: spacing.xs,
  },
});
