import { memo, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { SkeletonBlock } from "@/components/ui";
import { radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { useCardSlotEmpty } from "@/features/cardLayout/components/CardSlot";
import { RecurringOccurrenceRow } from "@/features/recurring/components";
import type { RecurringMonthResponse } from "@/features/recurring/types";
import { formatInrCompact } from "@/utils/currency";

import { InsightsCard } from "./InsightsCard";
import { createThemedStyles } from "@/theme";

export type InsightsFixedCostsCardProps = {
  data: RecurringMonthResponse | undefined;
  loading?: boolean;
  /** Start of the current local day, for the due-date wording. */
  today: Date;
};

const SKELETON_ROWS = 2;

/** This month's recurring expenses (paid and still to come). Renders nothing when there are none. */
export const InsightsFixedCostsCard = memo(function InsightsFixedCostsCard({
  data,
  loading = false,
  today,
}: InsightsFixedCostsCardProps) {
  const styles = useStyles();
  const expenses = useMemo(
    () => (data?.items ?? []).filter((item) => item.kind === "subscription"),
    [data?.items],
  );

  // Its slot in the arranged cards takes no space while there is nothing to show.
  useCardSlotEmpty(!loading && expenses.length === 0);
  if (!loading && expenses.length === 0) {
    return null;
  }

  return (
    <InsightsCard
      kicker="RECURRING COSTS"
      subtitle="Recurring bills this month"
    >
      {loading && expenses.length === 0 ? (
        Array.from({ length: SKELETON_ROWS }, (_, i) => (
          <View key={i} style={styles.skeletonRow}>
            <SkeletonBlock style={styles.skeletonTile} />
            <View style={styles.skeletonMeta}>
              <SkeletonBlock style={styles.skeletonPrimary} />
              <SkeletonBlock style={styles.skeletonSecondary} />
            </View>
            <SkeletonBlock style={styles.skeletonAmount} />
          </View>
        ))
      ) : (
        <>
          {expenses.map((occurrence, index) => (
            <View key={occurrence.id}>
              {index > 0 ? <View style={styles.divider} /> : null}
              <RecurringOccurrenceRow occurrence={occurrence} today={today} />
            </View>
          ))}
          {data ? (
            <View style={styles.footer}>
              <Text style={styles.footerText}>
                {`Paid ${formatInrCompact(data.totals.fixed_expense_paid)} · Upcoming ${formatInrCompact(data.totals.fixed_expense_upcoming)}`}
              </Text>
            </View>
          ) : null}
        </>
      )}
    </InsightsCard>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
    marginLeft: spacing.lg + 40 + spacing.md,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  footerText: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkSoft,
    fontVariant: ["tabular-nums"],
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
}));
