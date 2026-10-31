import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { format } from "date-fns";
import { Clock } from "lucide-react-native";
import { memo, useCallback, useMemo } from "react";
import { Platform, Pressable, Text, View } from "react-native";

import { radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";
import { parseReminderTime } from "@/lib/notifications/parseReminderTime";
import { createThemedStyles, useTheme } from "@/theme";

function toHHmm(d: Date): string {
  return format(d, "HH:mm");
}

function hhmmToDate(time: string): Date {
  const parsed = parseReminderTime(time);
  const date = new Date();
  if (parsed) {
    date.setHours(parsed.hour, parsed.minute, 0, 0);
  }
  return date;
}

export type SettingsTimeRowProps = {
  label: string;
  /** `HH:MM`. */
  time: string;
  disabled?: boolean;
  onTimeChange: (time: string) => void;
};

/** A row showing a time of day ("9:00 AM") that opens the system time picker (Android). */
export const SettingsTimeRow = memo(function SettingsTimeRow({
  label,
  time,
  disabled = false,
  onTimeChange,
}: SettingsTimeRowProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const timeDate = useMemo(() => hhmmToDate(time), [time]);
  const timeLabel = useMemo(() => format(timeDate, "h:mm a"), [timeDate]);

  const onPress = useCallback(() => {
    if (disabled || Platform.OS !== "android") {
      return;
    }
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
  }, [disabled, onTimeChange, timeDate]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${timeLabel}`}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.row,
        pressed && !disabled && styles.rowPressed,
        disabled && styles.rowDisabled,
      ]}
    >
      <Clock size={16} color={colors.inkSoft} strokeWidth={1.5} />
      <View style={styles.textCol}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{timeLabel}</Text>
      </View>
    </Pressable>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 44,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowPressed: {
    backgroundColor: colors.surfaceSunken,
  },
  rowDisabled: {
    opacity: 0.5,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  label: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkSoft,
  },
  value: {
    fontFamily: fontFamilies.medium,
    fontSize: 15,
    lineHeight: 22,
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
}));
