import { Check, Trash2 } from "lucide-react-native";
import { memo, useCallback, useEffect, useRef } from "react";
import {
  Pressable,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";

import { iconSizes, radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import {
  NOTIFICATION_ICON_WELL_SIZE,
  getNotificationInboxText,
  getNotificationRowVisual,
  NOTIFICATION_SWIPE_ACTION_WIDTH,
} from "@/features/notifications/notificationBentoTokens";
import type { AppNotification } from "@/features/notifications/types";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";
import { formatNotificationTime } from "@/utils/dateTime";
import { createThemedStyles, useTheme } from "@/theme";

export type NotificationBentoRowProps = {
  notification: AppNotification;
  unread: boolean;
  onPress: (notification: AppNotification) => void;
  onMarkRead?: (id: string) => void;
  onDelete?: (id: string) => void;
  onSwipeWillStart?: (methods: SwipeableMethods) => void;
};

const READ_KIND_ICON_OPACITY = 0.55;

export const NotificationBentoRow = memo(function NotificationBentoRow({
  notification,
  unread,
  onPress,
  onMarkRead,
  onDelete,
  onSwipeWillStart,
}: NotificationBentoRowProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const swipeableRef = useRef<SwipeableMethods | null>(null);
  const visual = getNotificationRowVisual(notification.kind, colors);
  const Icon = visual.icon;
  const timeLabel = formatNotificationTime(notification.createdAt);
  const textColors = unread
    ? getNotificationInboxText(colors).unread
    : getNotificationInboxText(colors).read;

  let kindIconWellStyle: StyleProp<ViewStyle> = {
    backgroundColor: visual.backgroundColor,
  };
  if (!unread) {
    kindIconWellStyle = [kindIconWellStyle, styles.kindIconWellRead];
  }

  const draggedRef = useRef(false);

  // FlashList recycles this component for other notifications: never carry an open swipe over.
  useEffect(() => {
    swipeableRef.current?.close();
    draggedRef.current = false;
  }, [notification.id]);

  const handlePress = useCallback(() => {
    void triggerHaptic();
    onPress(notification);
  }, [notification, onPress]);

  const handleCardPress = useCallback(() => {
    if (draggedRef.current) {
      return;
    }
    handlePress();
  }, [handlePress]);

  const handleDelete = useCallback(() => {
    if (onDelete == null) {
      return;
    }
    void triggerHaptic();
    onDelete(notification.id);
  }, [notification.id, onDelete]);

  const handleMarkRead = useCallback(() => {
    if (onMarkRead == null) {
      return;
    }
    void triggerHaptic();
    onMarkRead(notification.id);
    swipeableRef.current?.close();
  }, [notification.id, onMarkRead]);

  const handleOpenStartDrag = useCallback(() => {
    draggedRef.current = true;
    const methods = swipeableRef.current;
    if (methods != null) {
      onSwipeWillStart?.(methods);
    }
  }, [onSwipeWillStart]);

  const handleClosed = useCallback(() => {
    requestAnimationFrame(() => {
      draggedRef.current = false;
    });
  }, []);

  const renderRightActions = useCallback(
    () => (
      <View style={styles.actionsRow}>
        {unread && onMarkRead != null ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mark as read"
            onPress={handleMarkRead}
            style={styles.readAction}
          >
            <Check size={iconSizes.nav} color={colors.onSuccess} strokeWidth={2} />
          </Pressable>
        ) : null}
        {onDelete != null ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Delete notification"
            onPress={handleDelete}
            style={styles.deleteAction}
          >
            <Trash2 size={iconSizes.nav} color={colors.onDanger} strokeWidth={2} />
          </Pressable>
        ) : null}
      </View>
    ),
    [
      colors.onDanger,
      colors.onSuccess,
      handleDelete,
      handleMarkRead,
      onDelete,
      onMarkRead,
      styles,
      unread,
    ],
  );

  const accessibilityActions = [
    ...(onMarkRead != null && unread
      ? [{ name: "markAsRead" as const, label: "Mark as read" }]
      : []),
    ...(onDelete != null ? [{ name: "delete" as const, label: "Delete" }] : []),
  ];

  const card = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={notification.title}
      accessibilityHint="Swipe left for mark as read and delete"
      accessibilityActions={
        accessibilityActions.length > 0 ? accessibilityActions : undefined
      }
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === "delete") {
          handleDelete();
        }
        if (event.nativeEvent.actionName === "markAsRead") {
          handleMarkRead();
        }
      }}
      onPress={handleCardPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={[styles.iconWell, kindIconWellStyle]}>
        <Icon
          size={iconSizes.inline}
          color={visual.iconColor}
          strokeWidth={2}
        />
      </View>
      <View style={styles.textCol}>
        <Text
          style={[
            styles.title,
            unread ? styles.titleUnread : styles.titleRead,
            { color: textColors.title },
          ]}
          numberOfLines={2}
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
  );

  if (onDelete == null && onMarkRead == null) {
    return <View style={styles.shadowWrap}>{card}</View>;
  }

  return (
    <View style={styles.shadowWrap}>
      <ReanimatedSwipeable
        ref={swipeableRef}
        friction={1}
        overshootRight={false}
        rightThreshold={40}
        activeOffsetX={[-20, 20]}
        failOffsetY={[-24, 24]}
        containerStyle={styles.swipeClip}
        childrenContainerStyle={styles.slideLayer}
        onSwipeableOpenStartDrag={handleOpenStartDrag}
        onSwipeableClose={handleClosed}
        renderRightActions={renderRightActions}
      >
        {card}
      </ReanimatedSwipeable>
    </View>
  );
});

const useStyles = createThemedStyles(({ colors, shadows, typography }) => ({
  shadowWrap: {
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  swipeClip: {
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  slideLayer: {
    backgroundColor: colors.surface,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  cardPressed: {
    opacity: 0.88,
  },
  iconWell: {
    width: NOTIFICATION_ICON_WELL_SIZE,
    height: NOTIFICATION_ICON_WELL_SIZE,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  kindIconWellRead: {
    opacity: READ_KIND_ICON_OPACITY,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  title: {
    ...typography.rowPrimary,
  },
  titleUnread: {
    fontFamily: fontFamilies.semiBold,
  },
  titleRead: {
    fontFamily: fontFamilies.regular,
  },
  body: {
    ...typography.rowSecondary,
  },
  time: {
    ...typography.captionFaint,
  },
  actionsRow: {
    flexDirection: "row",
    height: "100%",
  },
  deleteAction: {
    width: NOTIFICATION_SWIPE_ACTION_WIDTH,
    height: "100%",
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  readAction: {
    width: NOTIFICATION_SWIPE_ACTION_WIDTH,
    height: "100%",
    backgroundColor: colors.success,
    alignItems: "center",
    justifyContent: "center",
  },
}));
