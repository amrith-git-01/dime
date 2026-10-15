import { memo } from "react";
import { Text, View } from "react-native";

import { Button } from "@/components/ui";
import { radius, spacing } from "@/constants";
import { createThemedStyles, useTheme } from "@/theme";

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
  const { shadows } = useTheme();
  const styles = useStyles();
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
        <View style={styles.action}>
          <Button
            title={actionLabel}
            size="compact"
            onPress={onAction}
          />
        </View>
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

const useStyles = createThemedStyles(({ colors, typography }) => ({
  centeredWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  cardShell: {
    backgroundColor: colors.surface,
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
  action: {
    marginTop: spacing.md,
  },
}));
