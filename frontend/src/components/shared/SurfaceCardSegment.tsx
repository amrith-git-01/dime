import { memo, type ReactNode } from "react";
import { View } from "react-native";

import { radius } from "@/constants";

import { CardSegmentShadowFrame } from "./CardSegmentShadowFrame";
import { createThemedStyles, useTheme } from "@/theme";

export type SurfaceCardSegmentProps = {
  children: ReactNode;
  isFirst: boolean;
  isLast: boolean;
  /** Outer horizontal margin, for lists whose content container has no side padding. */
  marginHorizontal?: number;
  /** Inner horizontal padding applied to the segment content. */
  paddingHorizontal?: number;
};

/**
 * One slice of a white card that is rendered as separate virtualized list items.
 * First/last segments round the card corners. The soft card shadow is kept by clipping each
 * segment's shadow to its sides (see {@link CardSegmentShadowFrame}), so stacked per-item
 * shadows show no seams between rows.
 */
export const SurfaceCardSegment = memo(function SurfaceCardSegment({
  children,
  isFirst,
  isLast,
  marginHorizontal,
  paddingHorizontal,
}: SurfaceCardSegmentProps) {
  const { shadows } = useTheme();
  const styles = useStyles();
  return (
    <CardSegmentShadowFrame
      isFirst={isFirst}
      isLast={isLast}
      marginHorizontal={marginHorizontal}
    >
      <View
        style={[
          styles.base,
          shadows.card,
          isFirst && styles.first,
          isLast && styles.last,
          paddingHorizontal !== undefined && { paddingHorizontal },
        ]}
      >
        {children}
      </View>
    </CardSegmentShadowFrame>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  base: {
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  first: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  last: {
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
}));
