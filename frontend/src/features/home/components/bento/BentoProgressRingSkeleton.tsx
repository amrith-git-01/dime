import { memo } from "react";
import { StyleSheet, View } from "react-native";

import { bento } from "@/constants";

import { HOME_SPEND_RING_SIZE } from "./homeBentoTokens";

type BentoProgressRingSkeletonProps = {
  size?: number;
  strokeWidth?: number;
};

/** Track-only ring placeholder matching {@link BentoProgressRing} layout. */
export const BentoProgressRingSkeleton = memo(
  function BentoProgressRingSkeleton({
    size = HOME_SPEND_RING_SIZE,
    strokeWidth = 7,
  }: BentoProgressRingSkeletonProps) {
    return (
      <View
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: strokeWidth,
          },
        ]}
      />
    );
  },
);

const styles = StyleSheet.create({
  ring: {
    borderColor: bento.chartOnPastel.track,
    alignSelf: "center",
    opacity: 0.6,
  },
});
