import { StyleSheet, View } from "react-native";

import { colors, spacing, surfaces } from "@/constants";

export interface AuthPostcardDotsProps {
  count: number;
  activeIndex: number;
}

export function AuthPostcardDots({
  count,
  activeIndex,
}: AuthPostcardDotsProps) {
  return (
    <View style={styles.row} accessibilityRole="tablist">
      {Array.from({ length: count }, (_, index) => (
        <View
          key={index}
          accessibilityRole="tab"
          accessibilityState={{ selected: index === activeIndex }}
          style={[styles.dot, index === activeIndex && styles.dotActive]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: surfaces.primaryTint14,
  },
  dotActive: {
    width: 20,
    backgroundColor: colors.brandPrimary,
  },
});
