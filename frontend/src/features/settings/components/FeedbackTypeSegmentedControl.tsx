import { memo, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";

import type { FeedbackType } from "../types";
import { createThemedStyles } from "@/theme";

const OPTIONS: { id: FeedbackType; label: string }[] = [
  { id: "bug", label: "Bug" },
  { id: "idea", label: "Idea" },
  { id: "enhancement", label: "Enhance" },
];

const TRACK_HEIGHT = 48;
const PILL_INSET = 3;

export type FeedbackTypeSegmentedControlProps = {
  value: FeedbackType;
  onChange: (type: FeedbackType) => void;
  disabled?: boolean;
};

/**
 * Sliding-pill type picker for feedback (Bug / Idea / Enhance).
 * Matches NotificationsFilterTabs — white pill on sunken track, no accent fill.
 */
export const FeedbackTypeSegmentedControl = memo(
  function FeedbackTypeSegmentedControl({
    value,
    onChange,
    disabled = false,
  }: FeedbackTypeSegmentedControlProps) {
    const styles = useStyles();
    const translateX = useSharedValue(0);
    const [trackWidth, setTrackWidth] = useState(0);
    const tabWidth = trackWidth / OPTIONS.length;
    const selectedIndex = Math.max(
      0,
      OPTIONS.findIndex((option) => option.id === value),
    );

    useEffect(() => {
      if (trackWidth > 0) {
        translateX.value = withSpring(selectedIndex * tabWidth, {
          damping: 18,
          stiffness: 220,
          mass: 0.9,
        });
      }
    }, [selectedIndex, tabWidth, translateX, trackWidth]);

    const pillStyle = useAnimatedStyle(() => ({
      transform: [{ translateX: translateX.value }],
    }));

    const handlePress = (type: FeedbackType) => {
      if (disabled || type === value) {
        return;
      }
      void triggerHaptic();
      onChange(type);
    };

    return (
      <View
        style={styles.track}
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      >
        {trackWidth > 0 ? (
          <Animated.View
            style={[
              styles.pill,
              { width: tabWidth - PILL_INSET * 2 },
              pillStyle,
            ]}
            pointerEvents="none"
          />
        ) : null}
        {OPTIONS.map((option) => (
          <Pressable
            key={option.id}
            style={styles.tab}
            onPress={() => handlePress(option.id)}
            disabled={disabled}
            accessibilityRole="tab"
            accessibilityState={{ selected: value === option.id, disabled }}
          >
            <Text
              style={[
                styles.label,
                value === option.id
                  ? styles.labelSelected
                  : styles.labelUnselected,
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
    );
  },
);

const useStyles = createThemedStyles(({ colors, shadows }) => ({
  track: {
    height: TRACK_HEIGHT,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSunken,
    flexDirection: "row",
    position: "relative",
    overflow: "hidden",
  },
  pill: {
    position: "absolute",
    top: PILL_INSET,
    left: PILL_INSET,
    bottom: PILL_INSET,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    ...shadows.pill,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
  },
  label: {
    fontSize: 14,
    lineHeight: 18,
  },
  labelSelected: {
    fontFamily: fontFamilies.semiBold,
    color: colors.ink,
  },
  labelUnselected: {
    fontFamily: fontFamilies.regular,
    color: colors.inkSoft,
  },
}));
