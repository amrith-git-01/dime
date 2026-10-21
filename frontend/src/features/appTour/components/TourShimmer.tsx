import { memo, useEffect, useId } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

const BAND_WIDTH_RATIO = 0.45;

export type TourShimmerProps = {
  width: number;
  height: number;
  /** Corner radius of what the shimmer lies on, so the band does not spill past its corners. */
  cornerRadius?: number;
  /** The band's brightest colour (a tint of the surface it crosses). */
  color: string;
  /** Bump to play the sweep once; 0 plays nothing. */
  playKey: number;
  /** Wait this long (ms) before the sweep starts. */
  delayMs?: number;
  durationMs?: number;
};

/**
 * One soft band of light that sweeps across a surface once each time `playKey` changes: the
 * "Sample data" pill appearing, the progress bar passing its halfway point, the Tour master
 * badge. Drawn with a Reanimated-animated view holding an SVG gradient (no GL surface of its own:
 * Skia canvases are kept to the tour's one scrim). Lies over its parent without taking touches.
 */
export const TourShimmer = memo(function TourShimmer({
  width,
  height,
  cornerRadius = 0,
  color,
  playKey,
  delayMs = 0,
  durationMs = 700,
}: TourShimmerProps) {
  const progress = useSharedValue(1);
  const gradientId = `tourShimmer${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  useEffect(() => {
    if (playKey === 0) {
      return;
    }
    progress.value = 0;
    progress.value = withDelay(
      delayMs,
      withTiming(1, { duration: durationMs, easing: Easing.inOut(Easing.quad) }),
    );
  }, [playKey, delayMs, durationMs, progress]);

  const bandWidth = width * BAND_WIDTH_RATIO;
  const bandStyle = useAnimatedStyle(() => ({
    opacity: progress.value >= 1 ? 0 : 1,
    transform: [
      { translateX: -bandWidth + progress.value * (width + bandWidth) },
    ],
  }));

  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        { borderRadius: cornerRadius, overflow: "hidden" },
      ]}
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <Animated.View
        style={[
          { position: "absolute", left: 0, top: 0, width: bandWidth, height },
          bandStyle,
        ]}
      >
        <Svg width={bandWidth} height={height}>
          <Defs>
            <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0.4">
              <Stop offset="0" stopColor={color} stopOpacity={0} />
              <Stop offset="0.5" stopColor={color} stopOpacity={1} />
              <Stop offset="1" stopColor={color} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect
            x={0}
            y={0}
            width={bandWidth}
            height={height}
            fill={`url(#${gradientId})`}
          />
        </Svg>
      </Animated.View>
    </View>
  );
});
