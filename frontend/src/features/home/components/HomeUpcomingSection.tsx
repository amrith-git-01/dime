import { memo } from "react";
import { StyleSheet, View } from "react-native";

import { ScreenSectionHeader } from "@/components/shared";
import { useCardSlotEmpty } from "@/features/cardLayout/components/CardSlot";
import { radius } from "@/constants/radius";
import { spacing } from "@/constants/spacing";
import { tourTargetIds } from "@/constants/tourTargetIds";
import { useTourTarget } from "@/hooks/useTourTarget";
import { RecurringListRow } from "@/features/recurring/components";
import type { RecurringItem } from "@/features/recurring/types";
import { createThemedStyles } from "@/theme";

type HomeUpcomingSectionProps = {
  items: RecurringItem[];
  /** Start of the current local day, for the due-date wording. */
  today: Date;
  onItemPress: (item: RecurringItem) => void;
};

/** Next recurring income / bills due in the coming 30 days. Renders nothing when there are none. */
export const HomeUpcomingSection = memo(function HomeUpcomingSection({
  items,
  today,
  onItemPress,
}: HomeUpcomingSectionProps) {
  const styles = useStyles();
  const tourTarget = useTourTarget(tourTargetIds.homeUpcoming);
  // Its slot in the arranged cards takes no space while there is nothing to show.
  useCardSlotEmpty(items.length === 0);
  if (items.length === 0) {
    return null;
  }

  return (
    <View {...tourTarget}>
      <ScreenSectionHeader title="Upcoming" />
      <View style={styles.card}>
        {items.map((item, index) => (
          <View key={item.id}>
            {index > 0 ? <View style={styles.divider} /> : null}
            <RecurringListRow item={item} today={today} onPress={onItemPress} />
          </View>
        ))}
      </View>
    </View>
  );
});

const useStyles = createThemedStyles(({ colors, shadows }) => ({
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
