import { memo, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

/** Horizontal (and bottom) room the soft card shadow needs around a segment. */
export const CARD_SEGMENT_SHADOW_BLEED = 12;
/** Top room for the first segment; the card shadow is offset downward so it needs less. */
export const CARD_SEGMENT_SHADOW_TOP_BLEED = 6;

type CardSegmentShadowFrameProps = {
  children: ReactNode;
  isFirst: boolean;
  isLast: boolean;
  /** Outer horizontal margin the segment's card edge should sit at. */
  marginHorizontal?: number;
};

/**
 * Lets a virtualized card segment keep the soft card shadow without seams.
 *
 * The frame clips each segment's shadow at its top and bottom edges (so stacked rows never
 * shadow over their neighbours) while leaving room on the sides. Only the first segment keeps
 * its top shadow and only the last keeps its bottom shadow, so together the segments read as
 * one shadowed card.
 *
 * The negative horizontal margin cancels the bleed padding, so the segment's card edge lines
 * up with the list's content edge. The list's content container needs at least
 * {@link CARD_SEGMENT_SHADOW_BLEED} of horizontal padding (or a segment margin) for the side
 * shadow to be visible inside the scroll view.
 */
export const CardSegmentShadowFrame = memo(function CardSegmentShadowFrame({
  children,
  isFirst,
  isLast,
  marginHorizontal = 0,
}: CardSegmentShadowFrameProps) {
  return (
    <View
      style={[
        styles.frame,
        { marginHorizontal: marginHorizontal - CARD_SEGMENT_SHADOW_BLEED },
        isFirst && styles.first,
        isLast && styles.last,
      ]}
    >
      {children}
    </View>
  );
});

const styles = StyleSheet.create({
  frame: {
    paddingHorizontal: CARD_SEGMENT_SHADOW_BLEED,
    overflow: "hidden",
  },
  first: {
    paddingTop: CARD_SEGMENT_SHADOW_TOP_BLEED,
  },
  last: {
    paddingBottom: CARD_SEGMENT_SHADOW_BLEED,
  },
});
