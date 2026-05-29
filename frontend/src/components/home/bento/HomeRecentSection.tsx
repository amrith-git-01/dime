import { ChevronRight } from "lucide-react-native";
import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { fontFamilies } from "@/constants/fonts";
import { bento, colors, spacing, typography } from "@/constants/theme";
import type { TransactionRow } from "@/features/transactions/types";

import { BentoQuickAddPills } from "./BentoQuickAddPills";
import { BentoSectionCard } from "./BentoSectionCard";
import { BentoTransactionTile } from "./BentoTransactionTile";
import {
  HOME_BENTO_GAP,
  HOME_MAX_RECENT,
  HOME_SECTION_HEADER_GAP,
} from "./homeBentoTokens";

type HomeRecentSectionProps = {
  transactions: TransactionRow[];
  isEmpty: boolean;
  onViewAll: () => void;
  onTransactionPress: (tx: TransactionRow) => void;
  onManualAdd: () => void;
  onReceipt: () => void;
  onVoice: () => void;
};

/**
 * Recent transactions inside a soft pastel bento box.
 * Empty state: copy + compact quick-add pills.
 */
export const HomeRecentSection = memo(function HomeRecentSection({
  transactions,
  isEmpty,
  onViewAll,
  onTransactionPress,
  onManualAdd,
  onReceipt,
  onVoice,
}: HomeRecentSectionProps) {
  const visible = transactions.slice(0, HOME_MAX_RECENT);

  return (
    <View>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent transactions</Text>
        <Pressable
          accessibilityRole="button"
          onPress={onViewAll}
          style={({ pressed }) => [
            styles.viewAll,
            pressed && styles.viewAllPressed,
          ]}
        >
          <Text style={styles.viewAllText}>View all</Text>
          <ChevronRight size={14} color={colors.primary} strokeWidth={2} />
        </Pressable>
      </View>

      <BentoSectionCard>
        {isEmpty ? (
          <View style={styles.emptyInner}>
            <Text style={styles.emptyText}>No recent transactions</Text>
            <Text style={styles.emptyHint}>
              Transactions will appear here as you add them.
            </Text>
            <BentoQuickAddPills
              onManualAdd={onManualAdd}
              onReceipt={onReceipt}
              onVoice={onVoice}
            />
          </View>
        ) : (
          <View style={styles.stack}>
            {visible.map((tx) => (
              <BentoTransactionTile
                key={tx.id}
                transaction={tx}
                onPress={onTransactionPress}
              />
            ))}
          </View>
        )}
      </BentoSectionCard>
    </View>
  );
});

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: HOME_SECTION_HEADER_GAP,
  },
  sectionTitle: {
    ...typography.sectionTitle,
  },
  viewAll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  viewAllPressed: {
    opacity: 0.65,
  },
  viewAllText: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.primary,
  },
  emptyInner: {
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  emptyText: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    lineHeight: 20,
    color: bento.onPastel.primary,
    textAlign: "center",
  },
  emptyHint: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 17,
    color: bento.onPastel.secondary,
    textAlign: "center",
    marginTop: spacing.xs,
  },
  stack: {
    gap: HOME_BENTO_GAP,
  },
});
