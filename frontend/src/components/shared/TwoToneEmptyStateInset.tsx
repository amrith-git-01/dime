import type { LucideIcon } from "lucide-react-native";
import { Inbox } from "lucide-react-native";
import { memo, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { bento, colors, radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";

import type { TwoToneEmptyAccent } from "./TwoToneEmptyState";
import { TWO_TONE_EMPTY_DEFAULT_ACCENT } from "./twoToneEmptyStateTokens";

export type TwoToneEmptyStateInsetProps = {
  title: string;
  message: string;
  icon?: LucideIcon;
  accent?: TwoToneEmptyAccent;
  footer?: ReactNode;
};

/**
 * Same visual as {@link TwoToneEmptyState} for embedding inside another card body
 * (e.g. Insights section header + empty body).
 */
export const TwoToneEmptyStateInset = memo(function TwoToneEmptyStateInset({
  title,
  message,
  icon: Icon = Inbox,
  accent = TWO_TONE_EMPTY_DEFAULT_ACCENT,
  footer,
}: TwoToneEmptyStateInsetProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <View
          style={[styles.iconWell, { backgroundColor: accent.backgroundColor }]}
        >
          <Icon size={20} color={accent.iconColor} strokeWidth={2} />
        </View>
        <Text style={styles.headerTitle}>{title}</Text>
      </View>
      <Text style={styles.message}>{message}</Text>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    alignItems: "center",
  },
  header: {
    alignItems: "center",
    gap: spacing.sm,
    paddingBottom: spacing.sm,
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
  message: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
    textAlign: "center",
  },
  footer: {
    marginTop: spacing.md,
    width: "100%",
    alignItems: "center",
  },
});
