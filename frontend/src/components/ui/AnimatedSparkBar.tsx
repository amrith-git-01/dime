import { radius } from "@/constants";
import { useTheme } from "@/theme";
import React, { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

interface AnimatedSparkBarProps {
  count?: number;
  height?: number;
  barWidth?: number;
  gap?: number;
  color?: string;
}

const AnimatedBar = ({
  delayMs,
  height,
  barWidth,
  color,
}: {
  delayMs: number;
  height: number;
  barWidth: number;
  color: string;
}) => {
  const animatedHeight = useSharedValue(height);

  useEffect(() => {
    const randomMin = height * 0.3;
    const randomMax = height;
    const targetHeight = randomMin + Math.random() * (randomMax - randomMin);

    const timeoutId = setTimeout(() => {
      animatedHeight.value = withTiming(targetHeight, {
        duration: 500,
        easing: Easing.out(Easing.cubic),
      });
    }, delayMs);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [animatedHeight, delayMs, height]);

  const animStyle = useAnimatedStyle(() => ({
    height: animatedHeight.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width: barWidth,
          borderRadius: radius.xs,
          backgroundColor: color,
        },
        animStyle,
      ]}
    />
  );
};

export const AnimatedSparkBar: React.FC<AnimatedSparkBarProps> = ({
  count = 7,
  height = 28,
  barWidth = 8,
  gap = 6,
  color,
}) => {
  const { colors } = useTheme();
  const barColor = color ?? colors.inkSoft;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-end",
        gap,
        height,
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <AnimatedBar
          key={i}
          delayMs={i * 100}
          height={height}
          barWidth={barWidth}
          color={barColor}
        />
      ))}
    </View>
  );
};
