import type { ReactNode } from "react";
import { View } from "react-native";

import { radius } from "@/constants";
import { createThemedStyles, useTheme } from "@/theme";

export type TwoToneCardProps = {
  /** Content rendered in the violet tinted header zone. */
  header: ReactNode;
  /** Content rendered in the white body zone below the divider. */
  body: ReactNode;
};

/**
 * Shared two-tone card shell — violet-tinted header + white body + brand shadow.
 * Used by TransactionsMonthBentoCard.
 *
 * overflow: "visible" is intentional — required for Android elevation shadow to
 * render outside the card bounds.
 */
export function TwoToneCard({ header, body }: TwoToneCardProps) {
  const { shadows } = useTheme();
  const styles = useStyles();
  return (
    <View style={[styles.card, shadows.cardElevated]}>
      <View style={styles.headerSection}>{header}</View>
      <View style={styles.bodySection}>{body}</View>
    </View>
  );
}

const useStyles = createThemedStyles(({ colors }) => ({
  card: {
    borderRadius: radius.lg,
    overflow: "visible",
  },
  headerSection: {
    backgroundColor: colors.bento.twoToneHeaderSurface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    overflow: "visible",
  },
  bodySection: {
    backgroundColor: colors.bento.twoToneBodySurface,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
}));
