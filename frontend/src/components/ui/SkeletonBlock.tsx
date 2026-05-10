import { useEffect, useRef } from "react";
import { Animated, StyleSheet, type StyleProp, type ViewStyle } from "react-native";

type SkeletonTone = "surface" | "onPrimary";

type SkeletonBlockProps = {
  style?: StyleProp<ViewStyle>;
  tone?: SkeletonTone;
};

const toneStyles: Record<SkeletonTone, ViewStyle> = {
  surface: {
    backgroundColor: "rgba(99,85,232,0.12)",
  },
  onPrimary: {
    backgroundColor: "rgba(255,255,255,0.24)",
  },
};

export function SkeletonBlock({ style, tone = "surface" }: SkeletonBlockProps) {
  const pulse = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.55,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => {
      animation.stop();
    };
  }, [pulse]);

  return (
    <Animated.View
      style={[styles.base, toneStyles[tone], { opacity: pulse }, style]}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 8,
  },
});
