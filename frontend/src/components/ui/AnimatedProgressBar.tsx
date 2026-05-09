import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';

interface AnimatedProgressBarProps {
  progress: number; // 0-1
  backgroundColor?: string;
  fillColor?: string;
  height?: number;
  duration?: number;
}

export const AnimatedProgressBar: React.FC<AnimatedProgressBarProps> = ({
  progress,
  backgroundColor = '#F2F0FF',
  fillColor = '#FF6B6B',
  height = 8,
  duration = 1000,
}) => {
  const animatedProgress = useSharedValue(0);

  useEffect(() => {
    animatedProgress.value = withTiming(progress, {
      duration,
      easing: Easing.inOut(Easing.ease),
    });
  }, [progress, animatedProgress, duration]);

  const animStyle = useAnimatedStyle(() => ({
    width: `${animatedProgress.value * 100}%`,
  }));

  return (
    <View
      style={[
        styles.track,
        {
          backgroundColor,
          height,
        },
      ]}
    >
      <Animated.View
        style={[
          styles.fill,
          {
            backgroundColor: fillColor,
            borderRadius: height / 2,
            height,
          },
          animStyle,
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  track: {
    borderRadius: 999,
    overflow: 'hidden',
    position: 'relative',
  },
  fill: {
    borderRadius: 999,
  },
});
