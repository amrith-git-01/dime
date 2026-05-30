import { memo, type ReactNode } from "react";
import { Platform, StyleSheet, View } from "react-native";

import { bento, radius } from "@/constants/theme";

import { HOME_SECTION_CARD_PADDING } from "./homeBentoTokens";

type BentoSectionCardProps = {
  children: ReactNode;
};

/**
 * Soft pastel container wrapping a Home section body (categories grid, recent list).
 * Matches reference bento-box grouping on light lavender tint.
 */
export const BentoSectionCard = memo(function BentoSectionCard({
  children,
}: BentoSectionCardProps) {
  return <View style={[styles.card, shadowStyle]}>{children}</View>;
});

const shadowStyle = Platform.select({
  android: { elevation: 2 },
  default: {
    shadowColor: bento.surface.lavender,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
  },
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: bento.sectionSurface,
    borderRadius: radius.lg,
    padding: HOME_SECTION_CARD_PADDING,
    overflow: "visible",
  },
});
