import type { DimensionValue, StyleProp, ViewStyle } from "react-native";

import { SkeletonBlock } from "./SkeletonBlock";
import {
  skeletonStripPresets,
  type SkeletonStripVariant,
} from "./skeletonStripPresets";

type SkeletonStripTone = "surface" | "onPrimary";

export type SkeletonStripProps = {
  variant: SkeletonStripVariant;
  tone?: SkeletonStripTone;
  width?: DimensionValue;
  style?: StyleProp<ViewStyle>;
};

/** Pulsing horizontal placeholder for a single loaded value (amount, stat, subtext). */
export function SkeletonStrip({
  variant,
  tone = "surface",
  width,
  style,
}: SkeletonStripProps) {
  return (
    <SkeletonBlock
      tone={tone}
      style={[skeletonStripPresets[variant], width != null && { width }, style]}
    />
  );
}
