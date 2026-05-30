import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { fontFamilies } from "@/constants/fonts";
import { bento } from "@/constants/theme";

type BentoProgressRingProps = {
  /** 0..1 — clamped internally */
  progress: number;
  size?: number;
  strokeWidth?: number;
  /** Show percentage label inside ring */
  showLabel?: boolean;
  /** light = pastel tile (brand ring + dark label); dark = saturated tile (white ring) */
  variant?: "light" | "dark";
};

/**
 * Circular SVG progress ring for bento tiles.
 * Adapts track/fill/label colors to light pastel or dark saturated surfaces.
 */
export const BentoProgressRing = memo(function BentoProgressRing({
  progress,
  size = 72,
  strokeWidth = 6,
  showLabel = true,
  variant = "dark",
}: BentoProgressRingProps) {
  const clamped = Math.min(1, Math.max(0, progress));
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const strokeDashoffset = circumference * (1 - clamped);
  const center = size / 2;
  const pct = Math.round(clamped * 100);
  const labelSize = size * 0.22;

  const isLight = variant === "light";
  const trackColor = isLight ? bento.chartOnPastel.track : bento.chart.track;
  const fillColor = isLight ? bento.chartOnPastel.fill : bento.chart.fill;
  const labelColor = isLight ? bento.onPastel.accent : "#FFFFFF";

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle
          cx={center}
          cy={center}
          r={r}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={center}
          cy={center}
          r={r}
          stroke={fillColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${center}, ${center}`}
        />
      </Svg>

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
