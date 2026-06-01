import DateTimePicker from "@react-native-community/datetimepicker";
import { format } from "date-fns";
import { ChevronRight } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { formStyles } from "@/constants/formStyles";

type ManualAddDateFieldProps = {
  transactionAt: Date;
  onDatePress: () => void;
  iosPickerVisible: boolean;
  onIosDateChange: (date: Date | undefined) => void;
};

export function ManualAddDateField({
  transactionAt,
  onDatePress,
  iosPickerVisible,
  onIosDateChange,
}: ManualAddDateFieldProps) {
  return (
    <>
      <View>
        <Text style={formStyles.fieldLabel}>Date</Text>
        <Pressable
          accessibilityRole="button"
          onPress={onDatePress}
          style={({ pressed }) => [
            styles.dateRow,
            pressed && styles.dateRowPressed,
          ]}
        >
          <Text style={styles.dateValue}>
            {format(transactionAt, "MMM d, yyyy")}
          </Text>
          <ChevronRight size={20} color={colors.inactive} strokeWidth={2} />
        </Pressable>
      </View>

      {iosPickerVisible ? (
        <View style={styles.iosPickerWrap}>
          <DateTimePicker
            value={transactionAt}
            mode="date"
            display="compact"
            themeVariant="light"
            onChange={(_e, date) => onIosDateChange(date)}
          />
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
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
