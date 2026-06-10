import { Check, Trash2, type LucideIcon } from "lucide-react-native";
import { memo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { colors, radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import {
  NOTIFICATION_ACTION_WELL_SIZE,
  NOTIFICATION_INBOX_TEXT,
  NOTIFICATION_ROW_ACTIONS,
  NOTIFICATION_ROW_VISUALS,
  type NotificationActionAccent,
} from "@/features/notifications/notificationBentoTokens";
import type { AppNotification } from "@/features/notifications/types";
import { triggerLightHaptic } from "@/lib/haptics/nativeHaptics";
import { formatNotificationTime } from "@/utils/dateTime";

export type NotificationBentoRowProps = {
  notification: AppNotification;
  unread: boolean;
  onPress: (notification: AppNotification) => void;
  onMarkRead?: (id: string) => void;
  onDelete?: (id: string) => void;
  showSeparator?: boolean;
};

const ICON_WELL_SIZE = 34;
const READ_KIND_ICON_OPACITY = 0.55;

type NotificationActionWellProps = {
  accessibilityLabel: string;
  icon: LucideIcon;
  accent: NotificationActionAccent;
  onPress: () => void;
};

const NotificationActionWell = memo(function NotificationActionWell({
  accessibilityLabel,
  icon: Icon,
  accent,
  onPress,
}: NotificationActionWellProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={6}
      onPress={() => {
        void triggerLightHaptic();
        onPress();
      }}
      style={({ pressed }) => [pressed && styles.rowPressed]}
    >
      <View
        style={[styles.actionWell, { backgroundColor: accent.backgroundColor }]}
      >
        <Icon size={15} color={accent.iconColor} strokeWidth={2} />
      </View>
    </Pressable>
  );
});

export const NotificationBentoRow = memo(function NotificationBentoRow({
  notification,
  unread,
  onPress,
  onMarkRead,
  onDelete,
  showSeparator = false,
}: NotificationBentoRowProps) {
  const showMarkRead = unread && onMarkRead != null;
  const showActions = showMarkRead || onDelete != null;
  const visual = NOTIFICATION_ROW_VISUALS[notification.kind];
  const Icon = visual.icon;
  const timeLabel = formatNotificationTime(notification.createdAt);
  const textColors = unread
    ? NOTIFICATION_INBOX_TEXT.unread
    : NOTIFICATION_INBOX_TEXT.read;

  let kindIconWellStyle: StyleProp<ViewStyle> = {
    backgroundColor: visual.backgroundColor,
  };
  if (!unread) {
    kindIconWellStyle = [kindIconWellStyle, styles.kindIconWellRead];
  }

  return (
    <View>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void triggerLightHaptic();
            onPress(notification);
          }}
          style={({ pressed }) => [
            styles.mainPressable,
            pressed && styles.rowPressed,
          ]}
        >
          <View style={[styles.iconWell, kindIconWellStyle]}>
            <Icon size={16} color={visual.iconColor} strokeWidth={2} />
          </View>

          <View style={styles.textCol}>
            <Text
              style={[
                styles.title,
                unread ? styles.titleUnread : styles.titleRead,
                { color: textColors.title },
              ]}
              numberOfLines={1}
            >
              {notification.title}
            </Text>
            <Text
              style={[styles.body, { color: textColors.body }]}
              numberOfLines={2}
            >
              {notification.body}
            </Text>
            <Text style={[styles.time, { color: textColors.time }]}>
              {timeLabel}
            </Text>
          </View>
        </Pressable>

        {showActions ? (
          <View style={styles.actions}>
            {showMarkRead ? (
              <NotificationActionWell
                accessibilityLabel="Mark as read"
                icon={Check}
                accent={NOTIFICATION_ROW_ACTIONS.markRead}
                onPress={() => onMarkRead!(notification.id)}
              />
            ) : null}
            {onDelete ? (
              <NotificationActionWell
                accessibilityLabel="Delete notification"
                icon={Trash2}
                accent={NOTIFICATION_ROW_ACTIONS.delete}
                onPress={() => onDelete(notification.id)}
              />
            ) : null}
          </View>
        ) : null}
      </View>
      {showSeparator ? <View style={styles.separator} /> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    minHeight: 44,
  },
  mainPressable: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minWidth: 0,
  },
  rowPressed: {
    opacity: 0.88,
  },
  iconWell: {
    width: ICON_WELL_SIZE,
    height: ICON_WELL_SIZE,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  kindIconWellRead: {
    opacity: READ_KIND_ICON_OPACITY,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  title: {
    fontSize: 13,
    lineHeight: 17,
  },
  titleUnread: {
    fontFamily: fontFamilies.medium,
  },
  titleRead: {
    fontFamily: fontFamilies.regular,
  },
  body: {
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    lineHeight: 15,
  },
  time: {
    fontFamily: fontFamilies.regular,
    fontSize: 10,
    lineHeight: 13,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    alignSelf: "center",
  },
  actionWell: {
    width: NOTIFICATION_ACTION_WELL_SIZE,
    height: NOTIFICATION_ACTION_WELL_SIZE,
    borderRadius: NOTIFICATION_ACTION_WELL_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: ICON_WELL_SIZE + spacing.sm,
  },
});
