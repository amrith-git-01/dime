import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { format } from "date-fns";
import { Clock } from "lucide-react-native";
import { memo, useCallback, useMemo } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { ink, inkSoft, line, radius, spacing, surfaceSunken } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";
import { parseReminderTime } from "@/lib/notifications/parseReminderTime";

import { useSettingsToggleBusyGate } from "../hooks/useSettingsToggleBusyGate";
import { SettingsFormCard } from "./SettingsFormCard";
import { SettingsToggleRow } from "./SettingsToggleRow";

function toHHmm(d: Date): string {
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

function hhmmToDate(time: string): Date {
  const parsed = parseReminderTime(time);
  const date = new Date();
  if (parsed) {
    date.setHours(parsed.hour, parsed.minute, 0, 0);
  }
  return date;
}

export type DailyExpenseReminderSectionProps = {
  enabled: boolean;
  time: string;
  disabled?: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onTimeChange: (time: string) => void;
};

export const DailyExpenseReminderSection = memo(
  function DailyExpenseReminderSection({
    enabled,
    time,
    disabled = false,
    onEnabledChange,
    onTimeChange,
  }: DailyExpenseReminderSectionProps) {
    const { onAnimationBusyChange } = useSettingsToggleBusyGate();

    const timeDate = useMemo(() => hhmmToDate(time), [time]);
    const timeLabel = useMemo(() => format(timeDate, "h:mm a"), [timeDate]);

    const openAndroidTimePicker = useCallback(() => {
      void triggerHaptic();
      DateTimePickerAndroid.open({
        value: timeDate,
        mode: "time",
        onChange: (_event, date) => {
          if (date) {
            onTimeChange(toHHmm(date));
          }
        },
      });
    }, [onTimeChange, timeDate]);

    const onTimeRowPress = useCallback(() => {
      if (disabled) {
        return;
      }
      if (Platform.OS === "android") {
        openAndroidTimePicker();
      }
    }, [disabled, openAndroidTimePicker]);

    return (
      <SettingsFormCard>
        <SettingsToggleRow
          label="Daily expense reminder"
          subtitle="Remind me once a day to log expenses."
          value={enabled}
          onValueChange={onEnabledChange}
          disabled={disabled}
          onAnimationBusyChange={onAnimationBusyChange}
        />
        {enabled ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Reminder time, ${timeLabel}`}
            onPress={onTimeRowPress}
            disabled={disabled}
            style={({ pressed }) => [
              styles.timeRow,
              pressed && !disabled && styles.timeRowPressed,
              disabled && styles.timeRowDisabled,
            ]}
          >
            <Clock size={16} color={inkSoft} strokeWidth={1.5} />
            <View style={styles.timeTextCol}>
              <Text style={styles.timeLabel}>Reminder time</Text>
              <Text style={styles.timeValue}>{timeLabel}</Text>
            </View>
          </Pressable>
        ) : null}
      </SettingsFormCard>
    );
  },
);

const styles = StyleSheet.create({
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 44,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: line,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  timeRowPressed: {
    backgroundColor: surfaceSunken,
  },
  timeRowDisabled: {
    opacity: 0.5,
  },
  timeTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  timeLabel: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: inkSoft,
  },
  timeValue: {
    fontFamily: fontFamilies.medium,
    fontSize: 15,
    lineHeight: 22,
    color: ink,
  },
});
