import { memo, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ScreenSectionHeader } from "@/components/shared";
import { SkeletonBlock } from "@/components/ui";
import { fontFamilies, radius, spacing } from "@/constants";
import { formatInrCompact } from "@/utils/currency";

import type { RecurringMonthResponse, RecurringOccurrence } from "../types";
import { RecurringOccurrenceRow } from "./RecurringOccurrenceRow";
import { createThemedStyles } from "@/theme";

export type RecurringMonthSectionProps = {
  data: RecurringMonthResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  /** Start of the current local day, for the due-date wording. */
  today: Date;
  onItemPress: (occurrence: RecurringOccurrence) => void;
};

const SKELETON_ROWS = 2;

/**
 * Budgets tab "Recurring this month": what has been paid and what is still to come for this month's
 * recurring expenses (and, in a smaller group, income), with totals. Renders nothing when there is
 * nothing recurring this month.
 */
export const RecurringMonthSection = memo(function RecurringMonthSection({
  data,
  isLoading,
  isError,
  onRetry,
  today,
  onItemPress,
}: RecurringMonthSectionProps) {
  const styles = useStyles();
  const { expenses, income } = useMemo(() => {
    const items = data?.items ?? [];
    return {
      expenses: items.filter((i) => i.kind === "subscription"),
      income: items.filter((i) => i.kind === "income"),
    };
  }, [data?.items]);

  if (isError && !data) {
    return (
      <View style={styles.root}>
        <ScreenSectionHeader title="Recurring this month" />
        <View style={[styles.card, styles.errorBlock]}>
          <Text style={styles.error}>Could not load this month&apos;s recurring.</Text>
          <Pressable accessibilityRole="button" onPress={onRetry} hitSlop={8}>
            <Text style={styles.retry}>Try again</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!isLoading && expenses.length === 0 && income.length === 0) {
    return null;
  }

  const totals = data?.totals;

  return (
    <View style={styles.root}>
      <ScreenSectionHeader title="Recurring this month" />
      <View style={styles.card}>
        {isLoading && !data
          ? Array.from({ length: SKELETON_ROWS }, (_, i) => (
              <View key={i} style={styles.skeletonRow}>
                <SkeletonBlock style={styles.skeletonTile} />
                <View style={styles.skeletonMeta}>
                  <SkeletonBlock style={styles.skeletonPrimary} />
                  <SkeletonBlock style={styles.skeletonSecondary} />
                </View>
                <SkeletonBlock style={styles.skeletonAmount} />
              </View>
            ))
          : null}

        {expenses.map((occurrence, index) => (
          <View key={occurrence.id}>
            {index > 0 ? <View style={styles.divider} /> : null}
            <RecurringOccurrenceRow
              occurrence={occurrence}
              today={today}
              onPress={onItemPress}
            />
          </View>
        ))}

        {income.length > 0 ? (
          <>
            {expenses.length > 0 ? <View style={styles.divider} /> : null}
            <Text style={styles.groupLabel}>Income</Text>
            {income.map((occurrence, index) => (
              <View key={occurrence.id}>
                {index > 0 ? <View style={styles.divider} /> : null}
                <RecurringOccurrenceRow
                  occurrence={occurrence}
                  today={today}
                  onPress={onItemPress}
                />
              </View>
            ))}
          </>
        ) : null}

        {totals ? (
          <View style={styles.footer}>
            {expenses.length > 0 ? (
              <Text style={styles.footerText}>
                {`Paid ${formatInrCompact(totals.fixed_expense_paid)} · Upcoming ${formatInrCompact(totals.fixed_expense_upcoming)}`}
              </Text>
            ) : null}
            {income.length > 0 ? (
              <Text style={styles.footerText}>
                {`Received ${formatInrCompact(totals.fixed_income_received)} · Expected ${formatInrCompact(totals.fixed_income_upcoming)}`}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
});

const useStyles = createThemedStyles(({ colors, shadows }) => ({
  root: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: "hidden",
    ...shadows.card,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
    marginHorizontal: spacing.lg,
  },
  groupLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkSoft,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: 2,
  },
  footerText: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkSoft,
    fontVariant: ["tabular-nums"],
  },
  errorBlock: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  error: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.danger,
  },
  retry: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.accentText,
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
