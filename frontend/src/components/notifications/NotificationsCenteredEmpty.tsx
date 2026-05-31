import type { LucideIcon } from "lucide-react-native";
import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { fontFamilies } from "@/constants/fonts";
import { colors, radius, spacing } from "@/constants/theme";
import {
  NOTIFICATION_EMPTY_ACCENT,
  NOTIFICATION_EMPTY_ICON,
} from "@/features/notifications/notificationBentoTokens";

export type NotificationsCenteredEmptyProps = {
  title: string;
  message: string;
  icon?: LucideIcon;
};

export const NotificationsCenteredEmpty = memo(
  function NotificationsCenteredEmpty({
    title,
    message,
    icon: Icon = NOTIFICATION_EMPTY_ICON,
  }: NotificationsCenteredEmptyProps) {
    return (
      <View style={styles.root}>
        <View
          style={[
            styles.iconWell,
            { backgroundColor: NOTIFICATION_EMPTY_ACCENT.backgroundColor },
          ]}
        >
          <Icon
            size={22}
            color={NOTIFICATION_EMPTY_ACCENT.iconColor}
            strokeWidth={2}
          />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  root: {
    flexGrow: 1,
    width: "100%",
    minHeight: 240,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  iconWell: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  title: {
    fontFamily: fontFamilies.medium,
    fontSize: 15,
    lineHeight: 20,
    color: colors.textPrimary,
    textAlign: "center",
  },
  message: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
    textAlign: "center",
    maxWidth: 260,
  },
});
