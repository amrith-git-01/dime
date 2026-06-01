import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { radius, spacing } from "@/constants";

import { SkeletonBlock } from "@/components/ui";

type SkeletonListRowProps = {
  minHeight: number;
  iconSize?: number;
  iconRadius?: number;
  gap?: number;
  titleWidth?: ViewStyle["width"];
  subtitleWidth?: ViewStyle["width"];
  amountWidth?: ViewStyle["width"];
  amountHeight?: number;
  style?: StyleProp<ViewStyle>;
};

export function SkeletonListRow({
  minHeight,
  iconSize = 38,
  iconRadius = radius.sm,
  gap = spacing.sm,
  titleWidth = "55%",
  subtitleWidth = "40%",
  amountWidth = 56,
  amountHeight = 14,
  style,
}: SkeletonListRowProps) {
  return (
    <View style={[styles.row, { minHeight, gap }, style]}>
      <SkeletonBlock
        tone="surface"
        style={[
          styles.icon,
          {
            width: iconSize,
            height: iconSize,
            borderRadius: iconRadius,
          },
        ]}
      />
      <View style={styles.text}>
        <SkeletonBlock
          tone="surface"
          style={[styles.title, { width: titleWidth }]}
        />
        <SkeletonBlock
          tone="surface"
          style={[styles.subtitle, { width: subtitleWidth }]}
        />
      </View>
      <SkeletonBlock
        tone="surface"
        style={[styles.amount, { width: amountWidth, height: amountHeight }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  icon: {
    flexShrink: 0,
  },
  text: {
    flex: 1,
    gap: 6,
  },
  title: {
    height: 14,
    borderRadius: radius.sm,
  },
  subtitle: {
    height: 11,
    borderRadius: radius.sm,
  },
  amount: {
    borderRadius: radius.sm,
  },
});
