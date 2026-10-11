import { useIsFocused } from "@react-navigation/native";
import { Canvas, Circle, Path } from "@shopify/react-native-skia";
import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useDerivedValue, type SharedValue } from "react-native-reanimated";

import { bento } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { INSIGHTS_CHART_DONUT_ANIMATION } from "@/features/analytics/constants/chartAnimation";
import { usePieClockwiseEntry } from "@/features/analytics/hooks/usePieClockwiseEntry";

import { buildStrokeArcPath } from "./utils/buildStrokeArcPath";

const RING_START_ANGLE = -90;

export type SkiaProgressRingProps = {
  /** 0..1 — clamped internally */
  progress: number;
  size?: number;
  strokeWidth?: number;
  showLabel?: boolean;
  variant?: "light" | "dark";
  revealIdentity: string;
  revealEnabled?: boolean;
};

type SkiaProgressRingArcProps = {
  progress: SharedValue<number>;
  targetProgress: number;
  center: number;
  radius: number;
  strokeWidth: number;
  color: string;
};

const SkiaProgressRingArc = memo(function SkiaProgressRingArc({
  progress,
  targetProgress,
  center,
  radius,
  strokeWidth,
  color,
}: SkiaProgressRingArcProps) {
  const arcPath = useDerivedValue(() => {
    const sweep = targetProgress * 360 * progress.value;
    return buildStrokeArcPath(center, center, radius, RING_START_ANGLE, sweep);
  });

  return (
    <Path
      path={arcPath}
      style="stroke"
      strokeWidth={strokeWidth}
      color={color}
      strokeCap="round"
    />
  );
});

/** Skia stroke progress ring with clockwise sweep reveal (matches insights donut). */
export const SkiaProgressRing = memo(function SkiaProgressRing({
  progress,
  size = 72,
  strokeWidth = 6,
  showLabel = true,
  variant = "dark",
  revealIdentity,
  revealEnabled = true,
}: SkiaProgressRingProps) {
  const isFocused = useIsFocused();
  const clamped = Math.min(1, Math.max(0, progress));
  const center = size / 2;
  const radius = (size - strokeWidth) / 2;
  const pct = Math.round(clamped * 100);
  const labelSize = size * 0.22;

  const isLight = variant === "light";
  const trackColor = isLight ? bento.chartOnPastel.track : bento.chart.track;
  const fillColor = isLight ? bento.chartOnPastel.fill : bento.chart.fill;
  const labelColor = isLight ? bento.onPastel.accent : bento.onSurface.primary;

  const revealProgress = usePieClockwiseEntry({
    identity: revealIdentity,
    enabled: revealEnabled,
    isVisible: isFocused,
    animateConfig: INSIGHTS_CHART_DONUT_ANIMATION,
  });

  return (
    <View style={{ width: size, height: size }}>
      <Canvas style={{ width: size, height: size }}>
        <Circle
          cx={center}
          cy={center}
          r={radius}
          color={trackColor}
          style="stroke"
          strokeWidth={strokeWidth}
        />
        <SkiaProgressRingArc
          progress={revealProgress}
          targetProgress={clamped}
          center={center}
          radius={radius}
          strokeWidth={strokeWidth}
          color={fillColor}
        />
      </Canvas>

      {showLabel ? (
        <View style={styles.labelWrap} pointerEvents="none">
          <Text
            style={[
              styles.label,
              {
                fontSize: labelSize,
                lineHeight: labelSize * 1.2,
                color: labelColor,
              },
            ]}
            numberOfLines={1}
          >
            {pct}%
          </Text>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  labelWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontFamily: fontFamilies.monoSemiBold,
  },
});
