import { memo, useEffect, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { fontFamilies } from "@/constants/fonts";
import { ink, inkSoft, radius, shadow, spacing, surface, surfaceSunken } from "@/constants";
import type { NotificationInboxFilter } from "@/features/notifications/types";
import { triggerLightHaptic } from "@/lib/haptics/nativeHaptics";

const TABS: { id: NotificationInboxFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "read", label: "Read" },
];

const TRACK_HEIGHT = 48;
const PILL_INSET = 3;

export type NotificationsFilterTabsProps = {
  value: NotificationInboxFilter;
  onChange: (filter: NotificationInboxFilter) => void;
};

const pillShadow = Platform.select({
  android: { elevation: 2 } as const,
  default: {
    shadowColor: shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  } as const,
});

export const NotificationsFilterTabs = memo(function NotificationsFilterTabs({
  value,
  onChange,
}: NotificationsFilterTabsProps) {
  const translateX = useSharedValue(0);
  const [trackWidth, setTrackWidth] = useState(0);
  const tabWidth = trackWidth / 3;

  const selectedIndex = TABS.findIndex((t) => t.id === value);

  useEffect(() => {
    if (trackWidth > 0) {
      translateX.value = withSpring(selectedIndex * tabWidth, {
        damping: 18,
        stiffness: 220,
        mass: 0.9,
      });
    }
  }, [selectedIndex, tabWidth, translateX, trackWidth]);

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const handlePress = (filter: NotificationInboxFilter) => {
    if (filter === value) return;
    void triggerLightHaptic();
    onChange(filter);
  };

  return (
    <View
      style={styles.track}
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
    >
      {trackWidth > 0 ? (
        <Animated.View
          style={[
            styles.pill,
            { width: tabWidth - PILL_INSET * 2 },
            pillStyle,
          ]}
          pointerEvents="none"
        />
      ) : null}
      {TABS.map((tab) => (
        <Pressable
          key={tab.id}
          style={styles.tab}
          onPress={() => handlePress(tab.id)}
          accessibilityRole="tab"
          accessibilityState={{ selected: value === tab.id }}
        >
          <Text
            style={[
              styles.label,
              value === tab.id ? styles.labelSelected : styles.labelUnselected,
            ]}
          >
            {tab.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  track: {
    height: TRACK_HEIGHT,
    borderRadius: radius.full,
    backgroundColor: surfaceSunken,
    flexDirection: "row",
    position: "relative",
    overflow: "hidden",
  },
  pill: {
    position: "absolute",
    top: PILL_INSET,
    left: PILL_INSET,
    bottom: PILL_INSET,
    borderRadius: radius.full,
    backgroundColor: surface,
    ...pillShadow,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
  },
  label: {
    fontSize: 14,
    lineHeight: 18,
  },
  labelSelected: {
    fontFamily: fontFamilies.semiBold,
    color: ink,
  },
  labelUnselected: {
    fontFamily: fontFamilies.regular,
    color: inkSoft,
  },
});
