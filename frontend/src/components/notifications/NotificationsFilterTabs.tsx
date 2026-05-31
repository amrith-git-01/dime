import { memo, useCallback } from "react";
import { StyleSheet, View } from "react-native";

import { SegmentChip } from "@/components/ui/SegmentChip/SegmentChip";
import { spacing } from "@/constants";
import type { NotificationInboxFilter } from "@/features/notifications/types";
import { triggerLightHaptic } from "@/lib/haptics/nativeHaptics";

const TABS: { id: NotificationInboxFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "read", label: "Read" },
];

export type NotificationsFilterTabsProps = {
  value: NotificationInboxFilter;
  onChange: (filter: NotificationInboxFilter) => void;
};

export const NotificationsFilterTabs = memo(function NotificationsFilterTabs({
  value,
  onChange,
}: NotificationsFilterTabsProps) {
  const handlePress = useCallback(
    (filter: NotificationInboxFilter) => {
      if (filter === value) return;
      void triggerLightHaptic();
      onChange(filter);
    },
    [onChange, value],
  );

  return (
    <View style={styles.row}>
      {TABS.map((tab) => (
        <SegmentChip
          key={tab.id}
          label={tab.label}
          selected={value === tab.id}
          onPress={() => handlePress(tab.id)}
        />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: spacing.sm,
  },
});
