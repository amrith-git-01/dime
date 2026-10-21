import { Trophy } from "lucide-react-native";
import { memo, useEffect, useState } from "react";
import { Text, View, type LayoutChangeEvent } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { radius, spacing, withAlpha } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { springs } from "@/constants/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { createThemedStyles, useTheme } from "@/theme";

import { TourShimmer } from "./TourShimmer";

const MEDAL_SIZE = 44;

export type TourMasterBadgeProps = {
  /** Play the shine (the first time the badge is seen); otherwise it is just shown. */
  shine: boolean;
};

/** "Tour master": the badge for having seen every tour, with a shine that sweeps across it once. */
export const TourMasterBadge = memo(function TourMasterBadge({
  shine,
}: TourMasterBadgeProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const enter = useSharedValue(reduceMotion ? 1 : 0);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    enter.value = reduceMotion
      ? withTiming(1, { duration: 180 })
      : withSpring(1, springs.bouncy);
  }, [reduceMotion, enter]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, enter.value * 1.5),
    transform: [{ scale: 0.92 + enter.value * 0.08 }],
  }));
  const medalStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${(1 - Math.min(1, enter.value)) * -25}deg` }],
  }));

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
  };

  return (
    <Animated.View
      accessible
      accessibilityLabel="Tour master. You have seen every tour."
      style={[styles.card, animatedStyle]}
      onLayout={onLayout}
    >
      <Animated.View style={[styles.medal, medalStyle]}>
        <Trophy size={22} color={colors.onAccent} strokeWidth={2} />
      </Animated.View>
      <View style={styles.text}>
        <Text style={styles.title}>Tour master</Text>
        <Text style={styles.subtitle}>You&apos;ve seen every tour. Replay any time.</Text>
      </View>
      {shine && !reduceMotion && size.width > 0 ? (
        <TourShimmer
          width={size.width}
          height={size.height}
          cornerRadius={radius.lg}
          color={withAlpha(colors.surface, 0.85)}
          playKey={1}
          delayMs={450}
          durationMs={1100}
        />
      ) : null}
    </Animated.View>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.accentTint,
    overflow: "hidden",
  },
  medal: {
    width: MEDAL_SIZE,
    height: MEDAL_SIZE,
    borderRadius: MEDAL_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 16,
    lineHeight: 22,
    color: colors.accentText,
  },
  subtitle: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkSoft,
  },
}));
