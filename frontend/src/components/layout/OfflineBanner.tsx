import { WifiOff } from "lucide-react-native";
import { memo } from "react";
import { Text } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { fontFamilies } from "@/constants/fonts";
import { spacing } from "@/constants/spacing";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { useConnectivityStore } from "@/stores/connectivityStore";
import { createThemedStyles, useTheme } from "@/theme";

/** Slim, non-blocking bar under the tab header while the device has no connection. */
export const OfflineBanner = memo(function OfflineBanner() {
  const { colors } = useTheme();
  const styles = useStyles();
  const isOnline = useConnectivityStore((state) => state.isOnline);
  const reduceMotion = useReduceMotion();

  if (isOnline) {
    return null;
  }
  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInDown.duration(180)}
      style={styles.bar}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <WifiOff size={14} color={colors.inkSoft} strokeWidth={2} />
      <Text style={styles.text}>{"You're offline. Showing saved data."}</Text>
    </Animated.View>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: 6,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surfaceSunken,
  },
  text: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkSoft,
  },
}));
