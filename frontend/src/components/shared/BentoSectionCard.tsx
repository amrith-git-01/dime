import { memo, type ReactNode } from "react";
import { View } from "react-native";

import { radius } from "@/constants";

import { BENTO_GAP, BENTO_SECTION_CARD_PADDING } from "@/components/bento";

import { CardSegmentShadowFrame } from "./CardSegmentShadowFrame";
import { createThemedStyles } from "@/theme";

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

/**
 * Soft pastel container wrapping a Home section body (category list, recent list).
 * Matches reference bento-box grouping on light lavender tint.
 */
export const BentoSectionCard = memo(function BentoSectionCard({
  children,
}: BentoSectionCardProps) {
  const styles = useStyles();
  return <View style={[styles.card, styles.shadow]}>{children}</View>;
});

/**
 * One row of a virtualized list that visually continues {@link BentoSectionCard}.
 * First/last segments get corner radius; each segment carries the card shadow, clipped to its
 * sides so stacked rows show no seams (see {@link CardSegmentShadowFrame}).
 */
export const BentoSectionCardSegment = memo(function BentoSectionCardSegment({
  children,
  isFirst,
  isLast,
  showGapAfter = false,
}: BentoSectionCardSegmentProps) {
  const styles = useStyles();
  return (
    <CardSegmentShadowFrame isFirst={isFirst} isLast={isLast}>
      <View
        style={[
          styles.segmentBase,
          styles.shadow,
          isFirst && styles.segmentFirst,
          isLast && styles.segmentLast,
        ]}
      >
        {children}
        {showGapAfter ? <View style={styles.segmentGap} /> : null}
      </View>
    </CardSegmentShadowFrame>
  );
});

const useStyles = createThemedStyles(({ colors, shadows }) => ({
  shadow: shadows.tinted,
  card: {
    backgroundColor: colors.bento.sectionSurface,
    borderRadius: radius.lg,
    padding: BENTO_SECTION_CARD_PADDING,
    overflow: "visible",
  },
  segmentBase: {
    backgroundColor: colors.bento.sectionSurface,
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
}));
