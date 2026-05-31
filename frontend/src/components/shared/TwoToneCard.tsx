import type { ReactNode } from "react";
import { Platform, StyleSheet, View } from "react-native";

import { bento, colors, radius } from "@/constants/theme";

export type TwoToneCardProps = {
  /** Content rendered in the violet tinted header zone. */
  header: ReactNode;
  /** Content rendered in the white body zone below the divider. */
  body: ReactNode;
};

/**
 * Shared two-tone card shell — violet-tinted header + white body + brand shadow.
 * Used by TransactionsMonthBentoCard and BudgetMonthBentoCard.
 *
 * overflow: "visible" is intentional — required for Android elevation shadow to
 * render outside the card bounds.
 */
export function TwoToneCard({ header, body }: TwoToneCardProps) {
  return (
    <View style={[styles.card, cardShadowStyle]}>
      <View style={styles.headerSection}>{header}</View>
      <View style={styles.bodySection}>{body}</View>
    </View>
  );
}

const cardShadowStyle = Platform.select({
  android: { elevation: 3 },
  default: {
    shadowColor: colors.brandPrimary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
  },
});

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    overflow: "visible",
  },
  headerSection: {
    backgroundColor: bento.twoToneHeaderSurface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    overflow: "visible",
  },
  bodySection: {
    backgroundColor: bento.twoToneBodySurface,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
});
