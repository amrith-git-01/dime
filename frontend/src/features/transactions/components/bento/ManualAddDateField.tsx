import DateTimePicker from "@react-native-community/datetimepicker";
import { format } from "date-fns";
import { Calendar, Clock } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { fontFamilies, radius, spacing } from "@/constants";
import { createThemedStyles, useTheme } from "@/theme";

export type ManualAddDateTimePickerMode = "date" | "time" | null;

type ManualAddDateFieldProps = {
  transactionAt: Date;
  onDatePress: () => void;
  onTimePress: () => void;
  iosPickerMode: ManualAddDateTimePickerMode;
  onIosPickerChange: (
    mode: Exclude<ManualAddDateTimePickerMode, null>,
    date: Date | undefined,
  ) => void;
};

function DateTimeRow({
  iconType,
  value,
  onPress,
}: {
  iconType: "date" | "time";
  value: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const Icon = iconType === "date" ? Calendar : Clock;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.ghostPill,
        pressed && styles.ghostPillPressed,
      ]}
    >
      <Icon size={16} color={colors.inkSoft} strokeWidth={1.5} />
      <Text style={styles.dateValue}>{value}</Text>
    </Pressable>
  );
}

export function ManualAddDateField({
  transactionAt,
  onDatePress,
  onTimePress,
  iosPickerMode,
  onIosPickerChange,
}: ManualAddDateFieldProps) {
  const styles = useStyles();
  const { scheme } = useTheme();
  return (
    <>
      <View style={styles.row}>
        <DateTimeRow
          iconType="date"
          value={format(transactionAt, "MMM d, yyyy")}
          onPress={onDatePress}
        />
        <DateTimeRow
          iconType="time"
          value={format(transactionAt, "h:mm a")}
          onPress={onTimePress}
        />
      </View>

      {iosPickerMode === "date" ? (
        <View style={styles.iosPickerWrap}>
          <DateTimePicker
            value={transactionAt}
            mode="date"
            display="compact"
            themeVariant={scheme}
            onChange={(_e, date) => onIosPickerChange("date", date)}
          />
        </View>
      ) : null}

      {iosPickerMode === "time" ? (
        <View style={styles.iosPickerWrap}>
          <DateTimePicker
            value={transactionAt}
            mode="time"
            display="compact"
            themeVariant={scheme}
            onChange={(_e, date) => onIosPickerChange("time", date)}
          />
        </View>
      ) : null}
    </>
  );
}

const useStyles = createThemedStyles(({ colors }) => ({
  row: {
    flexDirection: "row",
    gap: spacing.md,
  },
  ghostPill: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  ghostPillPressed: {
    opacity: 0.8,
  },
  dateValue: {
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    lineHeight: 20,
    color: colors.ink,
  },
  iosPickerWrap: {
    alignItems: "flex-start",
    marginTop: spacing.sm,
  },
}));
