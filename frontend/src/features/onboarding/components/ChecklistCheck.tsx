import { Canvas, Circle, Group, Path, Skia } from "@shopify/react-native-skia";
import { Check } from "lucide-react-native";
import { memo, useEffect, useMemo } from "react";
import { View } from "react-native";
import {
  Easing,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { springs } from "@/constants/motion";
import { createThemedStyles, useTheme } from "@/theme";

export const CHECKLIST_CHECK_SIZE = 26;
const CENTER = CHECKLIST_CHECK_SIZE / 2;
const RADIUS = 12;

/** The check circle drawing itself in: the badge pops, then the tick is stroked. */
const DrawnCheck = memo(function DrawnCheck() {
  const { colors } = useTheme();
  const badge = useSharedValue(0);
  const draw = useSharedValue(0);

  useEffect(() => {
    badge.value = withSpring(1, springs.bouncy);
    draw.value = withDelay(
      120,
      withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) }),
    );
  }, [badge, draw]);

  const tick = useMemo(() => {
    const path = Skia.Path.Make();
    path.moveTo(CENTER - 5, CENTER + 0.5);
    path.lineTo(CENTER - 1.5, CENTER + 4.5);
    path.lineTo(CENTER + 5.5, CENTER - 4);
    return path;
  }, []);

  const badgeTransform = useDerivedValue(() => [
    { scale: 0.5 + badge.value * 0.5 },
  ]);

  return (
    <Canvas style={{ width: CHECKLIST_CHECK_SIZE, height: CHECKLIST_CHECK_SIZE }}>
      <Group transform={badgeTransform} origin={{ x: CENTER, y: CENTER }}>
        <Circle cx={CENTER} cy={CENTER} r={RADIUS} color={colors.accent} />
      </Group>
      <Path
        path={tick}
        style="stroke"
        strokeWidth={2.5}
        strokeCap="round"
        strokeJoin="round"
        color={colors.onAccent}
        start={0}
        end={draw}
      />
    </Canvas>
  );
});

export type ChecklistCheckProps = {
  done: boolean;
  /** The item just turned done: draw the check in. Ignored under reduced motion (a static check shows). */
  animate: boolean;
  reduceMotion: boolean;
};

/** Empty ring while an item is open, a filled check once it is done. */
export const ChecklistCheck = memo(function ChecklistCheck({
  done,
  animate,
  reduceMotion,
}: ChecklistCheckProps) {
  const styles = useStyles();
  const { colors } = useTheme();

  if (!done) {
    return <View style={styles.ring} />;
  }
  if (animate && !reduceMotion) {
    return <DrawnCheck />;
  }
  return (
    <View style={styles.filled}>
      <Check size={16} color={colors.onAccent} strokeWidth={3} />
    </View>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  ring: {
    width: CHECKLIST_CHECK_SIZE,
    height: CHECKLIST_CHECK_SIZE,
    borderRadius: CHECKLIST_CHECK_SIZE / 2,
    borderWidth: 1.5,
    borderColor: colors.inkFaint,
  },
  filled: {
    width: CHECKLIST_CHECK_SIZE,
    height: CHECKLIST_CHECK_SIZE,
    borderRadius: CHECKLIST_CHECK_SIZE / 2,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
}));
