import LottieView from "lottie-react-native";
import { memo, useMemo } from "react";
import { StyleSheet, View } from "react-native";

import infinityLoader from "@/assets/lottie/infinity-loader.json";

/** Infinity path + 12px stroke bounds in the 800×600 Lottie comp. */
const INFINITY_ART_WIDTH = 170;
const INFINITY_ART_HEIGHT = 82;
const LOTTIE_COMP_WIDTH = 800;
const LOTTIE_COMP_HEIGHT = 600;

/** Matches the prior custom SVG loader footprint in buttons. */
export const BUTTON_LOADER_SIZE = 34;

export type InfinityButtonLoaderProps = {
  /** Stroke color — white on primary buttons, accent/danger on ghost buttons. */
  color: string;
  /** Visible width of the infinity in dp. */
  size?: number;
};

function toColorFilterHex(color: string): string {
  if (color.startsWith("#")) {
    return color.length === 9 ? color.slice(0, 7) : color;
  }
  return `#${color}`;
}

/**
 * Lottie infinity loader for button loading states.
 * @see frontend/assets/lottie/infinity-loader.json
 */
export const InfinityButtonLoader = memo(function InfinityButtonLoader({
  color,
  size = BUTTON_LOADER_SIZE,
}: InfinityButtonLoaderProps) {
  const colorFilters = useMemo(
    () => [
      { keypath: "Shape Layer 2", color: toColorFilterHex(color) },
      { keypath: "Shape Layer 1", color: toColorFilterHex(color) },
    ],
    [color],
  );

  const scale = size / INFINITY_ART_WIDTH;
  const clipWidth = size;
  const clipHeight = Math.ceil(
    size * (INFINITY_ART_HEIGHT / INFINITY_ART_WIDTH),
  );
  const lottieWidth = LOTTIE_COMP_WIDTH * scale;
  const lottieHeight = LOTTIE_COMP_HEIGHT * scale;

  return (
    <View style={[styles.clip, { width: clipWidth, height: clipHeight }]}>
      <LottieView
        source={infinityLoader}
        autoPlay
        loop
        colorFilters={colorFilters}
        style={{ width: lottieWidth, height: lottieHeight }}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  clip: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
});
