import DateTimePicker from "@react-native-community/datetimepicker";
import { format } from "date-fns";
import { ChevronRight } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { formStyles } from "@/constants/formStyles";

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
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={formStyles.fieldLabel}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          styles.dateRow,
          pressed && styles.dateRowPressed,
        ]}
      >
        <Text style={styles.dateValue}>{value}</Text>
        <ChevronRight size={20} color={colors.inactive} strokeWidth={2} />
      </Pressable>
    </View>
  );
}

export function ManualAddDateField({
  transactionAt,
  onDatePress,
  onTimePress,
  iosPickerMode,
  onIosPickerChange,
}: ManualAddDateFieldProps) {
  return (
    <>
      <View style={styles.row}>
        <DateTimeRow
          label="Date"
          value={format(transactionAt, "MMM d, yyyy")}
          onPress={onDatePress}
        />
        <DateTimeRow
          label="Time"
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
            themeVariant="light"
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
            themeVariant="light"
            onChange={(_e, date) => onIosPickerChange("time", date)}
          />
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: spacing.md,
  },
  field: {
    flex: 1,
  },
  dateRow: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.pageBackground,
  },
  dateRowPressed: {
    backgroundColor: colors.barBackground,
  },
  dateValue: {
    fontFamily: fontFamilies.regular,
    fontSize: 16,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  iosPickerWrap: {
    alignItems: "flex-start",
  },
});
