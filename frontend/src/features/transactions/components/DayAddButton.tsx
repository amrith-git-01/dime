import { Plus } from "lucide-react-native";
import { memo } from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { accent, accentTint } from "@/constants/colors";
import { fontFamilies } from "@/constants/fonts";
import { radius } from "@/constants/radius";
import { spacing } from "@/constants/spacing";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";

type DayAddButtonProps = {
  /** Day the new transaction is dated to (`yyyy-MM-dd`). */
  dayKey: string;
  onPress: (dayKey: string) => void;
};

/** Small "+ Add" pill on a day header: opens Add transaction pre-dated to that day. */
export const DayAddButton = memo(function DayAddButton({
  dayKey,
  onPress,
}: DayAddButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Add transaction on this day"
      hitSlop={8}
      onPress={() => {
        void triggerHaptic();
        onPress(dayKey);
      }}
      style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
    >
      <Plus size={14} color={accent} strokeWidth={2.5} />
      <Text style={styles.label}>Add</Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: 4,
    paddingLeft: spacing.sm,
    paddingRight: spacing.md,
    borderRadius: radius.full,
    backgroundColor: accentTint,
  },
  pillPressed: {
    opacity: 0.7,
  },
  label: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 13,
    lineHeight: 18,
    color: accent,
  },
});
