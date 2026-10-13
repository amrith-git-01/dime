import { ChevronDown } from "lucide-react-native";
import { memo, useCallback, useEffect } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { spacing, timings } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";
import { createThemedStyles, useTheme } from "@/theme";

export type GlossaryTermRowProps = {
  id: string;
  term: string;
  description: string;
  expanded: boolean;
  onToggle: (id: string) => void;
  showSeparator?: boolean;
};

export const GlossaryTermRow = memo(function GlossaryTermRow({
  id,
  term,
  description,
  expanded,
  onToggle,
  showSeparator = false,
}: GlossaryTermRowProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const progress = useSharedValue(expanded ? 1 : 0);
  const measuredHeight = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(expanded ? 1 : 0, timings.normal);
  }, [expanded, progress]);

  const handlePress = useCallback(() => {
    void triggerHaptic();
    onToggle(id);
  }, [id, onToggle]);

  const handleBodyLayout = useCallback(
    (event: LayoutChangeEvent) => {
      measuredHeight.value = event.nativeEvent.layout.height;
    },
    [measuredHeight],
  );

  const bodyStyle = useAnimatedStyle(() => ({
    height: measuredHeight.value * progress.value,
    opacity: progress.value,
  }));

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${interpolate(progress.value, [0, 1], [0, 180])}deg` },
    ],
  }));

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={term}
        onPress={handlePress}
        android_ripple={{ color: "transparent" }}
        style={styles.pressable}
      >
        <View style={styles.titleRow}>
          <Text style={styles.term}>{term}</Text>
          <Animated.View style={chevronStyle}>
            <ChevronDown size={20} color={colors.inkFaint} strokeWidth={2} />
          </Animated.View>
        </View>
        <Animated.View style={[styles.bodyClip, bodyStyle]}>
          <View style={styles.bodyMeasure} onLayout={handleBodyLayout}>
            <Text style={styles.description}>{description}</Text>
          </View>
        </Animated.View>
      </Pressable>
      {showSeparator ? <View style={styles.separator} /> : null}
    </View>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  pressable: {
    paddingHorizontal: spacing.sm,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 52,
  },
  term: {
    flex: 1,
    fontFamily: fontFamilies.medium,
    fontSize: 15,
    lineHeight: 22,
    color: colors.ink,
  },
  bodyClip: {
    overflow: "hidden",
  },
  bodyMeasure: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    paddingBottom: spacing.sm,
  },
  description: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.inkSoft,
    paddingRight: 28,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
    marginHorizontal: spacing.sm,
  },
}));
