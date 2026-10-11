import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { accent, radius, shadows, spacing, surface } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { typography } from "@/constants/typography";

export type EmptyStateLayout = "inset" | "card" | "centered";

export type EmptyStateProps = {
  headline: string;
  subtext: string;
  actionLabel?: string;
  onAction?: () => void;
  /**
   * `inset` — inside an existing parent card (Home sections, Insights cards).
   * `card` — standalone shadowed card on the page background.
   * `centered` — vertically centered full-area empty (notifications, list screens).
   */
  layout?: EmptyStateLayout;
  /** Tighter padding for narrow columns (compare month side-by-side). */
  compact?: boolean;
};

export const EmptyState = memo(function EmptyState({
  headline,
  subtext,
  actionLabel,
  onAction,
  layout = "inset",
  compact = false,
}: EmptyStateProps) {
  const showAction =
    actionLabel != null && onAction != null && actionLabel.length > 0;

  const content = (
    <View
      style={[
        styles.content,
        (layout === "inset" || layout === "card") && styles.contentInset,
        compact && styles.contentCompact,
      ]}
    >
      <View style={styles.textBlock}>
        <Text style={styles.headline} numberOfLines={2}>
          {headline}
        </Text>
        <Text style={styles.subtext} numberOfLines={3}>
          {subtext}
        </Text>
      </View>
      {showAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={({ pressed }) => [
            styles.actionBtn,
            pressed && styles.actionBtnPressed,
          ]}
        >
          <Text style={styles.actionLabel}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );

  if (layout === "centered") {
    return <View style={styles.centeredWrap}>{content}</View>;
  }

  if (layout === "card") {
    return <View style={[styles.cardShell, shadows.card]}>{content}</View>;
  }

  return content;
});

const styles = StyleSheet.create({
  centeredWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  cardShell: {
    backgroundColor: surface,
    borderRadius: radius.lg,
    overflow: "visible",
  },
  content: {
    alignSelf: "stretch",
    alignItems: "center",
  },
  contentInset: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  contentCompact: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  textBlock: {
    alignSelf: "stretch",
    alignItems: "center",
  },
  headline: {
    ...typography.cardTitle,
    fontSize: 16,
    lineHeight: 22,
    textAlign: "center",
  },
  subtext: {
    ...typography.emptyBody,
    textAlign: "center",
    marginTop: spacing.xs,
    alignSelf: "stretch",
  },
  actionBtn: {
    marginTop: spacing.md,
    backgroundColor: accent,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnPressed: {
    opacity: 0.92,
  },
  actionLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    lineHeight: 20,
    color: surface,
  },
});
