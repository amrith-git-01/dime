import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { colors } from "@/constants";

const BAR_WIDTH = 4;
const BAR_MAX = 22;
const BAR_MIN = 6;
const ACCENT = colors.headerGradientStart;

type BarProps = { delayMs: number };

function WaveBar({ delayMs }: BarProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    const t = setTimeout(() => {
      progress.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 420, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 420, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        false,
      );
    }, delayMs);
    return () => {
      clearTimeout(t);
    };
  }, [delayMs, progress]);

  const style = useAnimatedStyle(() => {
    const h = BAR_MIN + (BAR_MAX - BAR_MIN) * progress.value;
    return { height: h };
  });

  return <Animated.View style={[styles.bar, style]} />;
}

/** Lightweight “listening” indicator — three bars, no mic metering (keeps UI simple). */
export function VoiceMiniWaveform() {
  return (
    <View style={styles.row} accessibilityLabel="Listening">
      <WaveBar delayMs={0} />
      <WaveBar delayMs={110} />
      <WaveBar delayMs={220} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 5,
    height: BAR_MAX,
  },
  bar: {
    width: BAR_WIDTH,
    borderRadius: BAR_WIDTH / 2,
    backgroundColor: ACCENT,
  },
});
