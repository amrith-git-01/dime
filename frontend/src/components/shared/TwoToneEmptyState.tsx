import type { LucideIcon } from "lucide-react-native";
import { Inbox } from "lucide-react-native";
import { memo, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { bento, colors, radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { TwoToneCard } from "./TwoToneCard";

import {
  TWO_TONE_EMPTY_CENTERED_MAX_WIDTH,
  TWO_TONE_EMPTY_DEFAULT_ACCENT,
} from "./twoToneEmptyStateTokens";

export type TwoToneEmptyAccent = {
  backgroundColor: string;
  iconColor: string;
};

export type TwoToneEmptyStateLayout = "centered" | "inline";

export type TwoToneEmptyStateProps = {
  /** Tone 1 — headline below the icon in the violet header zone. */
  title: string;
  /** Tone 2 — supporting copy in the white body zone. */
  message: string;
  icon?: LucideIcon;
  accent?: TwoToneEmptyAccent;
  /**
   * `centered` — full-viewport empty (notifications inbox).
   * `inline` — fills parent width (list empty, bento section card).
   */
  layout?: TwoToneEmptyStateLayout;
  /** Optional actions below the message (e.g. quick-add pills). */
  footer?: ReactNode;
};

export const TwoToneEmptyState = memo(function TwoToneEmptyState({
  title,
  message,
  icon: Icon = Inbox,
  accent = TWO_TONE_EMPTY_DEFAULT_ACCENT,
  layout = "inline",
  footer,
}: TwoToneEmptyStateProps) {
  const card = (
    <TwoToneCard
      header={
        <View style={styles.header}>
          <View
            style={[
              styles.iconWell,
              { backgroundColor: accent.backgroundColor },
            ]}
          >
            <Icon size={20} color={accent.iconColor} strokeWidth={2} />
          </View>
          <Text style={styles.headerTitle}>{title}</Text>
        </View>
      }
      body={
        <View style={styles.body}>
          <Text style={styles.message}>{message}</Text>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      }
    />
  );

  if (layout === "centered") {
    return (
      <View style={styles.centerWrap}>
        <View style={styles.centeredCardShell}>{card}</View>
      </View>
    );
  }

  return <View style={styles.inlineShell}>{card}</View>;
});

const styles = StyleSheet.create({
  centerWrap: {
    flexGrow: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  centeredCardShell: {
    width: "100%",
    maxWidth: TWO_TONE_EMPTY_CENTERED_MAX_WIDTH,
  },
  inlineShell: {
    width: "100%",
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
  footer: {
    marginTop: spacing.md,
    width: "100%",
    alignItems: "center",
  },
});
