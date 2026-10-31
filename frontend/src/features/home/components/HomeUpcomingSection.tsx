import { Plus } from "lucide-react-native";
import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ScreenSectionHeader } from "@/components/shared";
import { useCardSlotEmpty } from "@/features/cardLayout/components/CardSlot";
import { fontFamilies } from "@/constants/fonts";
import { radius } from "@/constants/radius";
import { spacing } from "@/constants/spacing";
import { tourTargetIds } from "@/constants/tourTargetIds";
import { useTourTarget } from "@/hooks/useTourTarget";
import { RecurringListRow } from "@/features/recurring/components";
import type { RecurringItem } from "@/features/recurring/types";
import { ReminderRow } from "@/features/reminders/components";
import type { Reminder } from "@/features/reminders/types";
import type { UpcomingEntry } from "@/features/reminders/utils/upcomingMerge";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";
import { createThemedStyles, useTheme } from "@/theme";

type HomeUpcomingSectionProps = {
  entries: UpcomingEntry[];
  /** Start of the current local day, for the due-date wording. */
  today: Date;
  onItemPress: (item: RecurringItem) => void;
  onReminderPress: (reminder: Reminder) => void;
  /** Opens the Reminders list. */
  onSeeAll: () => void;
  /** Opens the new-reminder form. */
  onAdd: () => void;
};

/**
 * Next recurring income / bills and open reminders, soonest first (overdue reminders lead).
 * Renders nothing when there are none.
 */
export const HomeUpcomingSection = memo(function HomeUpcomingSection({
  entries,
  today,
  onItemPress,
  onReminderPress,
  onSeeAll,
  onAdd,
}: HomeUpcomingSectionProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const tourTarget = useTourTarget(tourTargetIds.homeUpcoming);
  // Its slot in the arranged cards takes no space while there is nothing to show.
  useCardSlotEmpty(entries.length === 0);
  if (entries.length === 0) {
    return null;
  }

  return (
    <View {...tourTarget}>
      <ScreenSectionHeader
        title="Upcoming"
        action={
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="See all reminders"
              hitSlop={8}
              onPress={() => {
                void triggerHaptic();
                onSeeAll();
              }}
              style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
            >
              <Text style={styles.pillText}>See all</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add a reminder"
              hitSlop={10}
              onPress={() => {
                void triggerHaptic();
                onAdd();
              }}
              style={({ pressed }) => [styles.addButton, pressed && styles.pillPressed]}
            >
              <Plus size={16} color={colors.accentText} strokeWidth={2.25} />
            </Pressable>
          </>
        }
      />
      <View style={styles.card}>
        {entries.map((entry, index) => (
          <View key={entry.id}>
            {index > 0 ? <View style={styles.divider} /> : null}
            {entry.kind === "recurring" ? (
              <RecurringListRow
                item={entry.item}
                today={today}
                onPress={onItemPress}
              />
            ) : (
              <ReminderRow
                variant="compact"
                reminder={entry.reminder}
                today={today}
                onPress={onReminderPress}
              />
            )}
          </View>
        ))}
      </View>
    </View>
  );
});

const useStyles = createThemedStyles(({ colors, shadows }) => ({
  pill: {
    backgroundColor: colors.accentTint,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  pillPressed: {
    opacity: 0.7,
  },
  pillText: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.accentText,
  },
  addButton: {
    width: 28,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentTint,
    borderRadius: radius.full,
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
}));
