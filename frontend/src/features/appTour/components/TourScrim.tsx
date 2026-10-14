import {
  BlurMask,
  Canvas,
  Group,
  Path,
  RoundedRect,
  Skia,
} from "@shopify/react-native-skia";
import { StyleSheet } from "react-native";
import { useDerivedValue, type SharedValue } from "react-native-reanimated";

import { useTheme } from "@/theme";

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
};

const RING_BASE_INSET = 3;
const RING_PULSE_TRAVEL = 4;

/**
 * Full-screen dim layer drawn in Skia: one path (screen rectangle + hole, even-odd fill) so the
 * hole is truly empty and can morph smoothly, plus a soft accent ring that breathes around it.
 * Purely visual; touches are handled by the blocker views in `AppTourOverlay`.
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
    () => RING_BASE_INSET + pulse.value * RING_PULSE_TRAVEL,
  );
  const ringX = useDerivedValue(() => holeX.value - ringInset.value);
  const ringY = useDerivedValue(() => holeY.value - ringInset.value);
  const ringWidth = useDerivedValue(
    () => holeWidth.value + ringInset.value * 2,
  );
  const ringHeight = useDerivedValue(
    () => holeHeight.value + ringInset.value * 2,
  );
  const ringRadius = useDerivedValue(
    () => holeRadius.value + ringInset.value,
  );
  const ringOpacity = useDerivedValue(() => {
    const hasHole = holeWidth.value > 0.5 && holeHeight.value > 0.5 ? 1 : 0;
    return enter.value * hasHole * (0.5 + pulse.value * 0.5);
  });

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
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
    </Canvas>
  );
}
