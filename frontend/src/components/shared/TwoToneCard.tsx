import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { bento, colors, radius, shadows } from "@/constants";

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
    <View style={[styles.card, shadows.cardElevated]}>
      <View style={styles.headerSection}>{header}</View>
      <View style={styles.bodySection}>{body}</View>
    </View>
  );
}

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
