import { Plus } from "lucide-react-native";
import { useCallback, useEffect } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { springs } from "@/constants/motion";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";
import { useAddTransactionFabStore } from "@/stores/addTransactionFabStore";

import { ACTION_BUBBLE_SIZE, ACTION_PLUS_ICON_SIZE } from "./dimeTabBarConfig";
import { createThemedStyles, useTheme } from "@/theme";

type DimeTabBarFabProps = {
  /** Restarts the idle-close countdown when the user touches the FAB. */
  onPressIn: () => void;
};

/** Central "+" button of the tab bar; toggles the radial add-transaction actions. */
export function DimeTabBarFab({ onPressIn }: DimeTabBarFabProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const fabOpen = useAddTransactionFabStore((s) => s.fabOpen);
  const toggleFab = useAddTransactionFabStore((s) => s.toggleFab);
  const plusRotationDeg = useSharedValue(0);

  useEffect(() => {
    plusRotationDeg.value = withSpring(fabOpen ? 45 : 0, springs.fabOpen);
  }, [fabOpen, plusRotationDeg]);

  const plusIconRotationStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${plusRotationDeg.value}deg` }],
  }));

  const toggleAddFab = useCallback(() => {
    void triggerHaptic();
    toggleFab();
  }, [toggleFab]);

  return (
    <View style={styles.centerPlusSlot}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          fabOpen ? "Close add transaction" : "Add transaction"
        }
        accessibilityState={{ expanded: fabOpen }}
        onPress={toggleAddFab}
        onPressIn={onPressIn}
        hitSlop={10}
        pressRetentionOffset={12}
        style={({ pressed }) => [
          styles.centerFab,
          pressed && styles.centerFabPressed,
        ]}
      >
        <Animated.View style={plusIconRotationStyle}>
          <Plus size={ACTION_PLUS_ICON_SIZE} color={colors.onInk} strokeWidth={2.5} />
        </Animated.View>
      </Pressable>
    </View>
  );
}

const useStyles = createThemedStyles(({ colors, shadows }) => ({
  centerPlusSlot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    overflow: "visible",
  },
  centerFab: {
    marginTop: -(ACTION_BUBBLE_SIZE / 2),
    width: ACTION_BUBBLE_SIZE,
    height: ACTION_BUBBLE_SIZE,
    borderRadius: ACTION_BUBBLE_SIZE / 2,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 8,
    ...shadows.fab,
  },
  centerFabPressed: {
    opacity: 0.85,
  },
}));
