import { CloudOff, TriangleAlert } from "lucide-react-native";
import { memo } from "react";
import { ActivityIndicator, Pressable, Text } from "react-native";

import { fontFamilies } from "@/constants/fonts";
import { radius } from "@/constants/radius";
import { spacing } from "@/constants/spacing";
import { createThemedStyles, useTheme } from "@/theme";

import { pendingChipLabel, pendingTone } from "../utils/pendingStatus";
import { usePendingTransactions } from "../hooks/usePendingTransactions";
import { useOutboxStore } from "@/stores/outboxStore";
import { usePendingSheetStore } from "@/stores/pendingSheetStore";

/**
 * "Pending n": writes saved on this device that the server has not got yet. Shown only while there
 * are some. Syncing: spinner. Waiting: cloud-off. Needs attention (a failed / blocked item): warning tint.
 */
export const PendingChip = memo(function PendingChip() {
  const { colors } = useTheme();
  const styles = useStyles();
  const { items } = usePendingTransactions();
  const syncing = useOutboxStore((s) => s.syncing);
  const openSheet = usePendingSheetStore((s) => s.open);

  if (items.length === 0) {
    return null;
  }
  const tone = pendingTone(items, syncing);
  const label = pendingChipLabel(items.length, tone);
  const tint = tone === "attention" ? colors.warning : colors.inkSoft;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Shows the entries waiting to sync"
      accessibilityLiveRegion="polite"
      hitSlop={6}
      onPress={openSheet}
      style={({ pressed }) => [
        styles.chip,
        tone === "attention" && styles.chipAttention,
        pressed && styles.chipPressed,
      ]}
    >
      {tone === "syncing" ? (
        <ActivityIndicator size="small" color={tint} style={styles.spinner} />
      ) : tone === "attention" ? (
        <TriangleAlert size={14} color={tint} strokeWidth={2} />
      ) : (
        <CloudOff size={14} color={tint} strokeWidth={2} />
      )}
      <Text style={[styles.text, { color: tint }]}>Pending {items.length}</Text>
    </Pressable>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  chip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  chipAttention: {
    backgroundColor: colors.warningTint,
  },
  chipPressed: {
    opacity: 0.7,
  },
  spinner: {
    transform: [{ scale: 0.7 }],
  },
  text: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
  },
}));
