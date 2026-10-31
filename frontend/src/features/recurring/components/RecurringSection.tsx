import { Plus } from "lucide-react-native";
import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  EmptyState,
  OptionalTourTarget,
  ScreenSectionHeader,
} from "@/components/shared";
import { SkeletonBlock } from "@/components/ui";
import { fontFamilies, radius, spacing } from "@/constants";
import { tourTargetIds } from "@/constants/tourTargetIds";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";
import { formatInrAmount } from "@/utils/currency";

import type { RecurringItem, RecurringKind } from "../types";
import { RECURRING_COPY } from "../utils/recurringDisplay";
import { RecurringListRow } from "./RecurringListRow";
import { createThemedStyles, useTheme } from "@/theme";

export type RecurringKindData = {
  items: RecurringItem[];
  /** Monthly total (yearly items prorated) as a decimal string; undefined until loaded. */
  monthlyTotal: string | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
};

export type RecurringSectionProps = {
  income: RecurringKindData;
  subscriptions: RecurringKindData;
  /** Start of the current local day, for the due-date wording. */
  today: Date;
  onAdd: (kind: RecurringKind) => void;
  onItemPress: (item: RecurringItem) => void;
  /** Opens the new-reminder form. */
  onAddReminder: () => void;
  /** Opens the Reminders list. */
  onSeeReminders: () => void;
};

const SKELETON_ROWS = 2;

/** Budgets tab "Recurring" section: a salary / income card and a subscriptions card. */
export const RecurringSection = memo(function RecurringSection({
  income,
  subscriptions,
  today,
  onAdd,
  onItemPress,
  onAddReminder,
  onSeeReminders,
}: RecurringSectionProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  // The guided tour points at the first recurring row of whichever card has rows first.
  const firstItemKind: RecurringKind =
    income.items.length > 0 ? "income" : "subscription";
  return (
    <View style={styles.root}>
      <ScreenSectionHeader title="Recurring" />
      <View style={styles.cards}>
        <RecurringKindCard
          kind="income"
          data={income}
          today={today}
          onAdd={onAdd}
          onItemPress={onItemPress}
          firstItemIsTourTarget={firstItemKind === "income"}
        />
        <RecurringKindCard
          kind="subscription"
          data={subscriptions}
          today={today}
          onAdd={onAdd}
          onItemPress={onItemPress}
          firstItemIsTourTarget={firstItemKind === "subscription"}
        />
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderText}>
              <Text style={styles.kicker}>Reminders</Text>
              <Text style={styles.reminderHint}>
                Bills to pay and money to collect, with a nudge before they are due.
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add reminder"
              onPress={() => {
                void triggerHaptic();
                onAddReminder();
              }}
              style={({ pressed }) => [styles.addBtn, pressed && styles.addBtnPressed]}
            >
              <Plus size={14} color={colors.accentText} strokeWidth={2.5} />
              <Text style={styles.addBtnText}>Add reminder</Text>
            </Pressable>
          </View>
          <View style={styles.divider} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="See all reminders"
            onPress={onSeeReminders}
            style={({ pressed }) => [styles.seeAll, pressed && styles.addBtnPressed]}
          >
            <Text style={styles.retry}>See all reminders</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
});

type RecurringKindCardProps = {
  kind: RecurringKind;
  data: RecurringKindData;
  today: Date;
  onAdd: (kind: RecurringKind) => void;
  onItemPress: (item: RecurringItem) => void;
  firstItemIsTourTarget: boolean;
};

function RecurringKindCard({
  kind,
  data,
  today,
  onAdd,
  onItemPress,
  firstItemIsTourTarget,
}: RecurringKindCardProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const copy = RECURRING_COPY[kind];
  const { items, monthlyTotal, isLoading, isError } = data;
  const isEmpty = !isLoading && !isError && items.length === 0;

  if (isEmpty) {
    return (
      <EmptyState
        layout="card"
        headline={copy.emptyHeadline}
        subtext={copy.emptySubtext}
        actionLabel={copy.addAction}
        onAction={() => onAdd(kind)}
      />
    );
  }

  const addDisabled = isLoading || isError;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderText}>
          <Text style={styles.kicker}>{copy.summaryKicker}</Text>
          {isLoading || monthlyTotal === undefined ? (
            <SkeletonBlock style={styles.totalSkeleton} />
          ) : (
            <Text style={styles.total}>{formatInrAmount(monthlyTotal)}</Text>
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.addAction}
          disabled={addDisabled}
          onPress={() => {
            void triggerHaptic();
            onAdd(kind);
          }}
          style={({ pressed }) => [
            styles.addBtn,
            addDisabled && styles.addBtnDisabled,
            pressed && !addDisabled && styles.addBtnPressed,
          ]}
        >
          <Plus size={14} color={colors.accentText} strokeWidth={2.5} />
          <Text style={styles.addBtnText}>Add</Text>
        </Pressable>
      </View>

      {isError ? (
        <View style={styles.errorBlock}>
          <Text style={styles.error}>
            Could not load {copy.screenTitle.toLowerCase()}.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={data.onRetry}
            hitSlop={8}
          >
            <Text style={styles.retry}>Try again</Text>
          </Pressable>
        </View>
      ) : isLoading ? (
        Array.from({ length: SKELETON_ROWS }, (_, i) => (
          <View key={i}>
            <View style={styles.divider} />
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
      ) : (
        items.map((item, index) => (
          <View key={item.id}>
            <View style={styles.divider} />
            <OptionalTourTarget
              id={
                firstItemIsTourTarget && index === 0
                  ? tourTargetIds.budgetsRecurringItem
                  : undefined
              }
            >
              <RecurringListRow item={item} today={today} onPress={onItemPress} />
            </OptionalTourTarget>
          </View>
        ))
      )}
    </View>
  );
}

const useStyles = createThemedStyles(({ colors, shadows }) => ({
  root: {
    paddingHorizontal: spacing.lg,
  },
  cards: {
    gap: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: "hidden",
    ...shadows.card,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  cardHeaderText: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  kicker: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkSoft,
  },
  total: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 20,
    lineHeight: 26,
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
  totalSkeleton: {
    height: 24,
    width: 120,
    borderRadius: 6,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.accentTint,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  addBtnDisabled: {
    opacity: 0.4,
  },
  addBtnPressed: {
    opacity: 0.7,
  },
  addBtnText: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.accentText,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
    marginHorizontal: spacing.lg,
  },
  errorBlock: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.xs,
  },
  error: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.danger,
  },
  reminderHint: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkSoft,
  },
  seeAll: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
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
