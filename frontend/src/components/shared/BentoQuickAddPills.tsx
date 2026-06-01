import { Camera, Edit3, Mic } from "lucide-react-native";
import { memo } from "react";
import { StyleSheet, View } from "react-native";

import { bento, spacing } from "@/constants";

import { BentoActionPill } from "./BentoActionPill";

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
        <BentoActionPill
          key={key}
          label={label}
          icon={Icon}
          backgroundColor={bg}
          accessibilityLabel={`Add ${label} transaction`}
          onPress={handlers[key]}
        />
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
});
