import {
  BlurMask,
  Canvas,
  Group,
  Path,
  RoundedRect,
  Skia,
} from "@shopify/react-native-skia";
import { StyleSheet, View } from "react-native";
import { useDerivedValue, type SharedValue } from "react-native-reanimated";

import { useTheme } from "@/theme";

import { TOUR_RIPPLE } from "../utils/tourMotion";

import { TourRing, type TourRingProps } from "./TourRing";
import { TourSparkleTrail, type TourSparkleTrailProps } from "./TourSparkleTrail";

/** What the scrim needs to draw a ring from a point (the shared values come from the overlay). */
export type TourScrimRing = Pick<TourRingProps, "x" | "y" | "clock">;

export type TourScrimProps = {
  width: number;
  height: number;
  /** Spotlight hole, in overlay coordinates. Width / height 0 means no hole. */
  holeX: SharedValue<number>;
  holeY: SharedValue<number>;
  holeWidth: SharedValue<number>;
  holeHeight: SharedValue<number>;
  holeRadius: SharedValue<number>;
  /** 0..1 fade of the whole scrim. */
  enter: SharedValue<number>;
  /** 0..1 breathing of the glow ring. */
  pulse: SharedValue<number>;
  /** 0.4..1: how strongly the ring glows (a "Do" step glows fully, a "Watch" step softly). */
  emphasis: SharedValue<number>;
  /** Sparkles left along the hole's path between targets; omit for none (reduced motion). */
  trail?: Omit<TourSparkleTrailProps, "color">;
  /** A small ring at the target when a "Do" step succeeds; omit for none (reduced motion). */
  ripple?: TourScrimRing;
  /** A wide ring when the tour zooms through to another screen; omit for none. */
  warp?: TourScrimRing;
};

const RING_BASE_INSET = 3;
const RING_PULSE_TRAVEL = 5;

/**
 * Full-screen dim layer drawn in Skia: one path (screen rectangle + hole, even-odd fill) so the
 * hole is truly empty and can morph smoothly, plus a soft accent ring that breathes around it.
 * Purely visual (hidden from screen readers); touches are handled by the blocker views in
 * `AppTourOverlay`.
 */
export function TourScrim({
  width,
  height,
  holeX,
  holeY,
  holeWidth,
  holeHeight,
  holeRadius,
  enter,
  pulse,
  emphasis,
  trail,
  ripple,
  warp,
}: TourScrimProps) {
  const { colors } = useTheme();

  const scrimPath = useDerivedValue(() => {
    const path = Skia.Path.Make();
    path.addRect(Skia.XYWHRect(0, 0, width, height));
    if (holeWidth.value > 0.5 && holeHeight.value > 0.5) {
      path.addRRect(
        Skia.RRectXY(
          Skia.XYWHRect(
            holeX.value,
            holeY.value,
            holeWidth.value,
            holeHeight.value,
          ),
          holeRadius.value,
          holeRadius.value,
        ),
      );
    }
    return path;
  });

  const ringInset = useDerivedValue(
    () => RING_BASE_INSET + pulse.value * RING_PULSE_TRAVEL * emphasis.value,
  );
  const ringX = useDerivedValue(() => holeX.value - ringInset.value);
  const ringY = useDerivedValue(() => holeY.value - ringInset.value);
  const ringWidth = useDerivedValue(
    () => holeWidth.value + ringInset.value * 2,
  );
  const ringHeight = useDerivedValue(
    () => holeHeight.value + ringInset.value * 2,
  );
  const ringRadius = useDerivedValue(() => holeRadius.value + ringInset.value);
  const ringOpacity = useDerivedValue(() => {
    const hasHole = holeWidth.value > 0.5 && holeHeight.value > 0.5 ? 1 : 0;
    return enter.value * hasHole * (0.45 + pulse.value * 0.55 * emphasis.value);
  });

  return (
    // The wrapper, not the Canvas, owns pointerEvents: a Skia Canvas on Android swallows touches
    // even with pointerEvents="none", which would block taps through the spotlight hole.
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <Canvas style={StyleSheet.absoluteFill}>
        <Path
          path={scrimPath}
          fillType="evenOdd"
          color={colors.overlays.scrimHeavy}
          opacity={enter}
        />
        <Group opacity={ringOpacity}>
          <RoundedRect
            x={ringX}
            y={ringY}
            width={ringWidth}
            height={ringHeight}
            r={ringRadius}
            style="stroke"
            strokeWidth={8}
            color={colors.accentText}
          >
            <BlurMask blur={9} style="normal" />
          </RoundedRect>
          <RoundedRect
            x={ringX}
            y={ringY}
            width={ringWidth}
            height={ringHeight}
            r={ringRadius}
            style="stroke"
            strokeWidth={2}
            color={colors.accentText}
          />
        </Group>
        {trail ? <TourSparkleTrail {...trail} color={colors.accentText} /> : null}
        {ripple ? (
          <TourRing
            {...ripple}
            durationMs={TOUR_RIPPLE.doneMs}
            fromRadius={10}
            toRadius={64}
            strokeWidth={3}
            opacity={0.85}
            color={colors.accentText}
          />
        ) : null}
        {warp ? (
          <TourRing
            {...warp}
            durationMs={TOUR_RIPPLE.warpMs}
            fromRadius={24}
            toRadius={Math.hypot(width, height)}
            strokeWidth={10}
            opacity={0.35}
            color={colors.accentText}
          />
        ) : null}
      </Canvas>
    </View>
  );
}
