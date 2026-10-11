import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { EmptyState } from "@/components/shared";
import { Button, SkeletonBlock } from "@/components/ui";
import {
  danger,
  fontFamilies,
  line,
  radius,
  shadows,
  spacing,
  surface,
} from "@/constants";

import type { RecurringItem, RecurringKind } from "../types";
import { RECURRING_COPY } from "../utils/recurringDisplay";
import { RecurringListRow } from "./RecurringListRow";
import { RecurringSummaryCard } from "./RecurringSummaryCard";

export type RecurringListContentProps = {
  kind: RecurringKind;
  items: RecurringItem[];
  monthlyTotal: string | undefined;
  summaryDetail: string;
  isLoading: boolean;
  isError: boolean;
  today: Date;
  onItemPress: (item: RecurringItem) => void;
  onAdd: () => void;
};

const SKELETON_ROWS = 3;

/** Body of the Salary & income / Subscriptions screens: monthly total, rows, add action. */
export const RecurringListContent = memo(function RecurringListContent({
  kind,
  items,
  monthlyTotal,
  summaryDetail,
  isLoading,
  isError,
  today,
  onItemPress,
  onAdd,
}: RecurringListContentProps) {
  const copy = RECURRING_COPY[kind];
  const isEmpty = !isLoading && !isError && items.length === 0;

  return (
    <View style={styles.root}>
      <RecurringSummaryCard
        kicker={copy.summaryKicker}
        monthlyTotal={monthlyTotal}
        detail={summaryDetail}
        isLoading={isLoading}
      />

      {isError ? (
        <Text style={styles.error}>Could not load this list. Try again.</Text>
      ) : isEmpty ? (
        <EmptyState
          layout="card"
          headline={copy.emptyHeadline}
          subtext={copy.emptySubtext}
          actionLabel={copy.addAction}
          onAction={onAdd}
        />
      ) : (
        <View style={styles.card}>
          {isLoading
            ? Array.from({ length: SKELETON_ROWS }, (_, i) => (
                <View key={i}>
                  {i > 0 ? <View style={styles.divider} /> : null}
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
            : items.map((item, index) => (
                <View key={item.id}>
                  {index > 0 ? <View style={styles.divider} /> : null}
                  <RecurringListRow
                    item={item}
                    today={today}
                    onPress={onItemPress}
                  />
                </View>
              ))}
        </View>
      )}

      {!isEmpty && !isError ? (
        <Button title={copy.addAction} onPress={onAdd} disabled={isLoading} />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    gap: spacing.lg,
  },
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
  error: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: danger,
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
    width: 56,
    borderRadius: 4,
  },
});
