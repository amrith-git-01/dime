import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { fontFamilies } from "@/constants/fonts";
import { bento, spacing } from "@/constants/theme";

import { BentoQuickAddPills } from "./BentoQuickAddPills";

export type BentoEmptyStateProps = {
  title: string;
  hint: string;
  onManualAdd: () => void;
  onReceipt: () => void;
  onVoice: () => void;
};

/**
 * Centered empty-state block — headline, supporting hint, quick-add pills.
 * Shared between HomeCategoriesBento and HomeRecentSection.
 */
export const BentoEmptyState = memo(function BentoEmptyState({
  title,
  hint,
  onManualAdd,
  onReceipt,
  onVoice,
}: BentoEmptyStateProps) {
  return (
    <View style={styles.inner}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.hint}>{hint}</Text>
      <BentoQuickAddPills
        onManualAdd={onManualAdd}
        onReceipt={onReceipt}
        onVoice={onVoice}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  inner: {
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  title: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    lineHeight: 20,
    color: bento.onPastel.primary,
    textAlign: "center",
  },
  hint: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 17,
    color: bento.onPastel.secondary,
    textAlign: "center",
    marginTop: spacing.xs,
  },
});
