import { useCallback } from "react";
import {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

/** Scale + spin feedback when swapping a generated avatar preview. */
export function useAvatarRefreshAnimation() {
  const avatarRotation = useSharedValue(0);
  const avatarScale = useSharedValue(1);

  const avatarAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${avatarRotation.value}deg` },
      { scale: avatarScale.value },
    ],
  }));

  const runRefreshFeedback = useCallback(() => {
    avatarScale.value = withSequence(
      withSpring(0.94, { damping: 18, stiffness: 320 }),
      withSpring(1.04, { damping: 14, stiffness: 240 }),
      withSpring(1, { damping: 16, stiffness: 220 }),
    );
    avatarRotation.value = 0;
    avatarRotation.value = withTiming(360, { duration: 420 }, (finished) => {
      if (finished) {
        avatarRotation.value = 0;
      }
    });
  }, [avatarRotation, avatarScale]);

  return { avatarAnimatedStyle, runRefreshFeedback };
}
