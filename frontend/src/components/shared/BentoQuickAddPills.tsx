import { Camera, Edit3, Mic } from "lucide-react-native";
import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { bento, iconSizes, radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";

type BentoQuickAddPillsProps = {
  onManualAdd: () => void;
  onReceipt: () => void;
  onVoice: () => void;
};

const ACTIONS = [
  {
    key: "manual" as const,
    label: "Manual",
    Icon: Edit3,
    bg: bento.actionIcon.manual,
  },
  {
    key: "receipt" as const,
    label: "Receipt",
    Icon: Camera,
    bg: bento.actionIcon.receipt,
  },
  {
    key: "voice" as const,
    label: "Voice",
    Icon: Mic,
    bg: bento.actionIcon.voice,
  },
];

/**
 * Compact pill quick-add row for section empty states.
 * Icon + label inline on a small pastel pill — not bulky circle buttons.
 */
export const BentoQuickAddPills = memo(function BentoQuickAddPills({
  onManualAdd,
  onReceipt,
  onVoice,
}: BentoQuickAddPillsProps) {
  const handlers = {
    manual: onManualAdd,
    receipt: onReceipt,
    voice: onVoice,
  };

  return (
    <View style={styles.row}>
      {ACTIONS.map(({ key, label, Icon, bg }) => (
        <Pressable
          key={key}
          accessibilityRole="button"
          accessibilityLabel={`Add ${label} transaction`}
          onPress={handlers[key]}
          style={({ pressed }) => [
            styles.pill,
            { backgroundColor: bg },
            pressed && styles.pillPressed,
          ]}
        >
          <Icon
            size={iconSizes.quickAdd}
            color={bento.onSurface.primary}
            strokeWidth={2}
          />
          <Text style={styles.pillLabel}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.full,
  },
  pillPressed: {
    opacity: 0.82,
  },
  pillLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    lineHeight: 14,
    color: bento.onSurface.primary,
  },
});
