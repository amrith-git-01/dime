import { memo, useCallback } from "react";
import { StyleSheet, Text, View } from "react-native";

import { TextField } from "@/components/ui";
import { colors, spacing } from "@/constants";
import { formStyles } from "@/constants/formStyles";

type CategoryBudgetSectionProps = {
  value: string;
  onChangeText: (text: string) => void;
};

function sanitizeBudgetInput(text: string): string {
  const stripped = text.replace(/[^\d.]/g, "");
  const dot = stripped.indexOf(".");
  if (dot === -1) {
    return stripped;
  }
  const whole = stripped.slice(0, dot);
  const fraction = stripped.slice(dot + 1).replace(/\./g, "");
  return fraction.length > 0
    ? `${whole}.${fraction}`
    : whole + (stripped.endsWith(".") ? "." : "");
}

export const CategoryBudgetSection = memo(function CategoryBudgetSection({
  value,
  onChangeText,
}: CategoryBudgetSectionProps) {
  const handleChange = useCallback(
    (text: string) => {
      onChangeText(sanitizeBudgetInput(text));
    },
    [onChangeText],
  );

  return (
    <View style={styles.wrap}>
      <TextField
        label="Monthly budget (optional)"
        placeholder="e.g. 5000"
        value={value}
        onChangeText={handleChange}
        keyboardType="decimal-pad"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="done"
      />
      <Text style={styles.hint}>
        Leave empty for no cap. Budget tab shows share of this category budget.
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.xs,
  },
  hint: {
    fontFamily: formStyles.fieldError.fontFamily,
    fontSize: formStyles.fieldError.fontSize,
    lineHeight: formStyles.fieldError.lineHeight,
    color: colors.textSecondary,
  },
});
