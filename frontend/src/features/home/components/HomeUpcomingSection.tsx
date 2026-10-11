import { memo } from "react";
import { StyleSheet, View } from "react-native";

import { ScreenSectionHeader } from "@/components/shared";
import { line, surface } from "@/constants/colors";
import { radius } from "@/constants/radius";
import { shadows } from "@/constants/shadows";
import { spacing } from "@/constants/spacing";
import { RecurringListRow } from "@/features/recurring/components";
import type { RecurringItem } from "@/features/recurring/types";

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
  if (items.length === 0) {
    return null;
  }

  return (
    <View>
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
});
