import { memo, type ReactNode } from "react";
import { Platform, StyleSheet, View } from "react-native";

import { bento, radius } from "@/constants";

import {
  BENTO_GAP,
  BENTO_SECTION_CARD_PADDING,
} from "@/components/bento";

type BentoSectionCardProps = {
  children: ReactNode;
};

export type BentoSectionCardSegmentProps = {
  children: ReactNode;
  isFirst: boolean;
  isLast: boolean;
  /** Gap between stacked rows inside the same section card (FlashList segments). */
  showGapAfter?: boolean;
};

const shadowStyle = Platform.select({
  android: { elevation: 2 },
  default: {
    shadowColor: bento.surface.lavender,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
  },
});

/**
 * Soft pastel container wrapping a Home section body (categories grid, recent list).
 * Matches reference bento-box grouping on light lavender tint.
 */
export const BentoSectionCard = memo(function BentoSectionCard({
  children,
}: BentoSectionCardProps) {
  return <View style={[styles.card, shadowStyle]}>{children}</View>;
});

/**
 * One row of a virtualized list that visually continues {@link BentoSectionCard}.
 * First/last segments get corner radius; shadow stays on the full card only.
 */
export const BentoSectionCardSegment = memo(function BentoSectionCardSegment({
  children,
  isFirst,
  isLast,
  showGapAfter = false,
}: BentoSectionCardSegmentProps) {
  return (
    <View
      style={[
        styles.segmentBase,
        isFirst && styles.segmentFirst,
        isLast && styles.segmentLast,
      ]}
    >
      {children}
      {showGapAfter ? <View style={styles.segmentGap} /> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: bento.sectionSurface,
    borderRadius: radius.lg,
    padding: BENTO_SECTION_CARD_PADDING,
    overflow: "visible",
  },
  segmentBase: {
    backgroundColor: bento.sectionSurface,
    paddingHorizontal: BENTO_SECTION_CARD_PADDING,
  },
  segmentFirst: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: BENTO_SECTION_CARD_PADDING,
  },
  segmentLast: {
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    paddingBottom: BENTO_SECTION_CARD_PADDING,
  },
  segmentGap: {
    height: BENTO_GAP,
  },
});
