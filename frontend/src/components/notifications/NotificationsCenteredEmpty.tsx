import type { LucideIcon } from "lucide-react-native";
import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { BENTO_FORM_SECTION_PADDING } from "@/components/bento/bentoFormTokens";
import { TwoToneCard } from "@/components/shared/TwoToneCard";
import { fontFamilies } from "@/constants/fonts";
import { bento, colors, radius, spacing } from "@/constants/theme";
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
      <View style={styles.centerWrap}>
        <View style={styles.cardShell}>
          <TwoToneCard
            header={
              <View style={styles.header}>
                <View
                  style={[
                    styles.iconWell,
                    {
                      backgroundColor:
                        NOTIFICATION_EMPTY_ACCENT.backgroundColor,
                    },
                  ]}
                >
                  <Icon
                    size={22}
                    color={NOTIFICATION_EMPTY_ACCENT.iconColor}
                    strokeWidth={2}
                  />
                </View>
                <Text style={styles.headerTitle}>{title}</Text>
              </View>
            }
            body={
              <View style={styles.body}>
                <Text style={styles.bodyText}>{message}</Text>
              </View>
            }
          />
        </View>
      </View>
    );
  },
);

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
    maxWidth: 360,
  },
  header: {
    alignItems: "center",
    gap: spacing.sm,
    padding: BENTO_FORM_SECTION_PADDING,
    paddingVertical: spacing.lg,
  },
  iconWell: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 16,
    lineHeight: 22,
    color: bento.onPastel.primary,
    textAlign: "center",
  },
  body: {
    paddingHorizontal: BENTO_FORM_SECTION_PADDING,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  bodyText: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
    textAlign: "center",
  },
});
