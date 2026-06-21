import { memo } from "react";
import { StyleSheet, View } from "react-native";

import { EmptyState, emptyStateCopy } from "@/components/shared";
import { SkeletonBlock } from "@/components/ui";
import { line, surface } from "@/constants/colors";
import { radius } from "@/constants/radius";
import { shadows } from "@/constants/shadows";
import { spacing } from "@/constants/spacing";
import { TransactionRow } from "@/features/transactions/components/TransactionRow";
import type { TransactionRow as TransactionRowData } from "@/features/transactions/types";

import { HomeSectionHeader } from "./HomeSectionHeader";

const HOME_MAX_RECENT = 5;
const SKELETON_COUNT = 3;

type HomeRecentSectionProps = {
  transactions: TransactionRowData[];
  isEmpty: boolean;
  isLoading?: boolean;
  onViewAll: () => void;
  onTransactionPress: (tx: TransactionRowData) => void;
  onManualAdd: () => void;
};

export const HomeRecentSection = memo(function HomeRecentSection({
  transactions,
  isEmpty,
  isLoading = false,
  onViewAll,
  onTransactionPress,
  onManualAdd,
}: HomeRecentSectionProps) {
  const visible = transactions.slice(0, HOME_MAX_RECENT);

  return (
    <View>
      <HomeSectionHeader title="Recent transactions" onViewAll={onViewAll} />

      <View style={styles.card}>
        {isLoading ? (
          Array.from({ length: SKELETON_COUNT }, (_, i) => (
            <View key={i}>
              {i > 0 && <View style={styles.divider} />}
              <View style={styles.skeletonRow}>
                <SkeletonBlock style={styles.skeletonTile} />
                <View style={styles.skeletonMeta}>
                  <SkeletonBlock style={styles.skeletonPrimary} />
                  <SkeletonBlock style={styles.skeletonSecondary} />
                </View>
                <SkeletonBlock style={styles.skeletonAmount} />
              </View>
            </View>
          ))
        ) : isEmpty ? (
          <EmptyState
            layout="inset"
            headline={emptyStateCopy.homeRecent.headline}
            subtext={emptyStateCopy.homeRecent.subtext}
            actionLabel={emptyStateCopy.homeRecent.actionLabel}
            onAction={onManualAdd}
          />
        ) : (
          visible.map((tx, index) => (
            <View key={tx.id}>
              {index > 0 && <View style={styles.divider} />}
              <TransactionRow transaction={tx} onPress={onTransactionPress} />
            </View>
          ))
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: surface,
    borderRadius: radius.lg,
    overflow: "hidden",
    ...shadows.card,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: line,
    marginHorizontal: spacing.lg,
  },
  skeletonRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  skeletonTile: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
  },
  skeletonMeta: {
    flex: 1,
    gap: 6,
  },
  skeletonPrimary: {
    height: 14,
    width: "55%",
    borderRadius: 4,
  },
  skeletonSecondary: {
    height: 11,
    width: "35%",
    borderRadius: 4,
  },
  skeletonAmount: {
    height: 14,
    width: 44,
    borderRadius: 4,
  },
});
