import { ArrowLeftRight, CornerDownLeft, Eye, Link2 } from "lucide-react-native";
import { memo } from "react";
import { Text, View } from "react-native";

import { fontFamilies } from "@/constants/fonts";
import { radius } from "@/constants/radius";
import { createThemedStyles, useTheme } from "@/theme";

import type { TransactionBadge } from "../utils/transactionDisplay";

export type TransactionBadgeKind = TransactionBadge;

const LABELS: Record<TransactionBadgeKind, string> = {
  transfer: "Transfer",
  payback: "Payback",
  paidBack: "Paid back",
  paysBack: "Pays back",
  review: "Needs review",
};

const ICONS = {
  transfer: ArrowLeftRight,
  payback: CornerDownLeft,
  paidBack: Link2,
  paysBack: Link2,
  review: Eye,
} as const;

/**
 * Small pill for a row that does not count the usual way (see `transactionBadges`). Everyday spend and income carry no
 * badge.
 */
export const TransactionKindBadge = memo(function TransactionKindBadge({
  kind,
}: {
  kind: TransactionBadgeKind;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const Icon = ICONS[kind];
  return (
    <View style={styles.pill} accessibilityLabel={LABELS[kind]}>
      <Icon size={10} color={colors.inkSoft} strokeWidth={2} />
      <Text style={styles.text}>{LABELS[kind]}</Text>
    </View>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.full,
    paddingHorizontal: 6,
    paddingVertical: 1,
    flexShrink: 0,
  },
  text: {
    fontFamily: fontFamilies.medium,
    fontSize: 10,
    lineHeight: 14,
    color: colors.inkSoft,
  },
}));
