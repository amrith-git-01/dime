import type { LucideIcon } from "lucide-react-native";
import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { TwoToneCard } from "@/components/shared/TwoToneCard";
import { fontFamilies } from "@/constants/fonts";
import { bento, colors, radius, spacing } from "@/constants/theme";
import {
  NOTIFICATION_EMPTY_ACCENT,
  NOTIFICATION_EMPTY_ICON,
} from "@/features/notifications/notificationBentoTokens";
import type { NotificationInboxFilter } from "@/features/notifications/types";

export type NotificationEmptyStateProps = {
  title: string;
  message: string;
  icon?: LucideIcon;
};

export const NOTIFICATION_INBOX_EMPTY: Pick<
  NotificationEmptyStateProps,
  "title" | "message"
> = {
  title: "No notifications yet",
  message: "Capture and budget alerts will show up here.",
};

export const NOTIFICATION_FILTER_EMPTY: Record<
  NotificationInboxFilter,
  Pick<NotificationEmptyStateProps, "title" | "message">
> = {
  all: {
    title: "No notifications",
    message: "You're all caught up.",
  },
  unread: {
    title: "No unread",
    message: "You're all caught up.",
  },
  read: {
    title: "No read items",
    message: "Open a notification to see it here.",
  },
};

export const NotificationEmptyState = memo(function NotificationEmptyState({
  title,
  message,
  icon: Icon = NOTIFICATION_EMPTY_ICON,
}: NotificationEmptyStateProps) {
  return (
    <View style={styles.centerWrap}>
      <View style={styles.cardShell}>
        <TwoToneCard
          header={
            <View style={styles.header}>
              <View
                style={[
                  styles.iconWell,
                  {
                    backgroundColor: NOTIFICATION_EMPTY_ACCENT.backgroundColor,
                  },
                ]}
              >
                <Icon
                  size={20}
                  color={NOTIFICATION_EMPTY_ACCENT.iconColor}
                  strokeWidth={2}
                />
              </View>
              <Text style={styles.headerTitle}>{title}</Text>
            </View>
          }
          body={
            <View style={styles.body}>
              <Text style={styles.message}>{message}</Text>
            </View>
          }
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  centerWrap: {
    flexGrow: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  cardShell: {
    width: "100%",
    maxWidth: 300,
  },
  header: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  iconWell: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: fontFamilies.medium,
    fontSize: 15,
    lineHeight: 20,
    color: bento.onPastel.primary,
    textAlign: "center",
  },
  body: {
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  message: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
    textAlign: "center",
  },
});
