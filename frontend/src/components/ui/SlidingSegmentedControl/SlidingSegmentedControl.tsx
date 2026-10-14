import { memo, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { radius } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";
import { createThemedStyles } from "@/theme";

export type SlidingSegmentedTone = "neutral" | "danger" | "success";

export type SlidingSegmentedOption<T extends string = string> = {
  value: T;
  label: string;
  /** Colour of the label while selected. Defaults to neutral ink. */
  tone?: SlidingSegmentedTone;
};

export type SlidingSegmentedControlProps<T extends string = string> = {
  options: readonly SlidingSegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
};

const TRACK_HEIGHT = 44;
const PILL_INSET = 3;

/**
 * Pill track with a surface pill that springs under the selected option
 * (Expense / Income on Add transaction, Monthly / Yearly on the recurring editor).
 */
function SlidingSegmentedControlInner<T extends string>({
  options,
  value,
  onChange,
}: SlidingSegmentedControlProps<T>) {
  const styles = useStyles();
  const translateX = useSharedValue(0);
  const [trackWidth, setTrackWidth] = useState(0);
  const tabWidth = trackWidth / options.length;
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
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

  return (
    <View
      style={styles.track}
      onLayout={(e) => {
        const width = e.nativeEvent.layout.width;
        // First measurement: place the pill directly (no spring in from the left).
        if (trackWidth === 0 && width > 0) {
          translateX.value = selectedIndex * (width / options.length);
        }
        setTrackWidth(width);
      }}
    >
      {trackWidth > 0 ? (
        <Animated.View
          style={[styles.pill, { width: tabWidth - PILL_INSET * 2 }, pillStyle]}
          pointerEvents="none"
        />
      ) : null}
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            style={styles.tab}
            onPress={() => {
              if (selected) return;
              void triggerHaptic();
              onChange(option.value);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
          >
            <Text
              style={[
                styles.tabLabel,
                selected ? styles.labelSelected : styles.labelUnselected,
                selected && toneStyle(styles, option.tone),
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function toneStyle(
  styles: ReturnType<typeof useStyles>,
  tone: SlidingSegmentedTone = "neutral",
) {
  return styles[`${tone}Selected`];
}

export const SlidingSegmentedControl = memo(
  SlidingSegmentedControlInner,
) as typeof SlidingSegmentedControlInner;

const useStyles = createThemedStyles(({ colors, shadows }) => ({
  track: {
    height: TRACK_HEIGHT,
    borderRadius: radius.full,
    backgroundColor: colors.line,
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
  },
  tabLabel: {
    fontSize: 14,
    lineHeight: 18,
  },
  labelSelected: {
    fontFamily: fontFamilies.semiBold,
  },
  labelUnselected: {
    fontFamily: fontFamilies.regular,
    color: colors.inkSoft,
  },
  neutralSelected: { color: colors.ink },
  dangerSelected: { color: colors.danger },
  successSelected: { color: colors.success },
}));
