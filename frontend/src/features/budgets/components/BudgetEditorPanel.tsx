import { getDaysInMonth } from "date-fns";
import { memo } from "react";
import { Platform, StyleSheet, Text, TextInput, View } from "react-native";

import { Button } from "@/components/ui/Button/Button";
import { TextField } from "@/components/ui/TextField/TextField";
import { fontFamilies } from "@/constants/fonts";
import { colors, spacing, typography } from "@/constants/theme";

export type BudgetEditorPanelProps = {
  hasMonthlyBudget: boolean;
  monthlyBudgetText: string;
  onChangeMonthlyBudgetText: (text: string) => void;
  onSaveMonthlyBudget: () => void;
  onCancelBudgetEdit: () => void;
  isBudgetSaving: boolean;
  isBudgetLoading: boolean;
  selectedYear: number;
  selectedMonthIndex0: number;
};

export const BudgetEditorPanel = memo(function BudgetEditorPanel({
  hasMonthlyBudget,
  monthlyBudgetText,
  onChangeMonthlyBudgetText,
  onSaveMonthlyBudget,
  onCancelBudgetEdit,
  isBudgetSaving,
  isBudgetLoading,
  selectedYear,
  selectedMonthIndex0,
}: BudgetEditorPanelProps) {
  const daysInMonth = getDaysInMonth(
    new Date(selectedYear, selectedMonthIndex0, 1),
  );
  const dailyLimitFromText = monthlyBudgetText
    ? Number.parseFloat(monthlyBudgetText)
    : 0;
  const dailyLimitAmount =
    Number.isFinite(dailyLimitFromText) && dailyLimitFromText > 0
      ? Math.round(dailyLimitFromText / daysInMonth)
      : 0;
  const dailyLimitDisplay = dailyLimitAmount > 0 ? `₹${dailyLimitAmount}` : "—";

  return (
    <View style={styles.editorCard}>
      <Text style={styles.editorLabel}>
        {hasMonthlyBudget ? "Update budget" : "Monthly budget"}
      </Text>
      <Text style={styles.editorDescription}>
        Set the monthly budget that works for you.
      </Text>
      <View style={[styles.amountShell, styles.amountShellMin]}>
        <View style={styles.currencyPrefixWrap}>
          <Text style={styles.currencyPrefix}>₹</Text>
        </View>
        <TextInput
          style={styles.amountInput}
          placeholder="0.00"
          placeholderTextColor={colors.inactive}
          keyboardType="decimal-pad"
          value={monthlyBudgetText}
          onChangeText={onChangeMonthlyBudgetText}
          underlineColorAndroid="transparent"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={onSaveMonthlyBudget}
        />
      </View>
      <View style={styles.editorActionsRow}>
        <View style={styles.actionButtonWrap}>
          <Button
            title="Update"
            loading={isBudgetSaving}
            onPress={onSaveMonthlyBudget}
            disabled={isBudgetLoading}
          />
        </View>
        {hasMonthlyBudget ? (
          <View style={styles.actionButtonWrap}>
            <Button
              title="Cancel"
              variant="secondary"
              onPress={onCancelBudgetEdit}
            />
          </View>
        ) : null}
      </View>
      <View style={styles.dailyLimitSection}>
        <TextField
          label="Daily limit"
          value={dailyLimitDisplay}
          editable={false}
          showClear={false}
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  editorCard: {
    marginBottom: spacing.lg,
    padding: spacing.lg,
    borderRadius: 20,
    backgroundColor: colors.barBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  editorLabel: {
    fontFamily: typography.headerUsernameLine.fontFamily,
    fontSize: 16,
    color: colors.textPrimary,
  },
  editorDescription: {
    marginTop: spacing.xs,
    marginBottom: spacing.md,
    fontFamily: typography.screenSubtitle.fontFamily,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  editorActionsRow: {
    marginTop: spacing.md,
    flexDirection: "row",
    gap: spacing.md,
  },
  actionButtonWrap: {
    flex: 1,
  },
  dailyLimitSection: {
    marginTop: spacing.md,
  },
  amountShell: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.pageBackground,
  },
  amountShellMin: {
    minHeight: 52,
  },
  currencyPrefixWrap: {
    marginRight: spacing.xs,
    justifyContent: "center",
    ...Platform.select({
      android: { height: 26 },
    }),
  },
  currencyPrefix: {
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 24,
    color: colors.textPrimary,
    ...Platform.select({
      android: {
        includeFontPadding: false,
        lineHeight: 26,
      },
      default: {
        lineHeight: 30,
      },
    }),
  },
  amountInput: {
    flex: 1,
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 24,
    color: colors.textPrimary,
    padding: 0,
    margin: 0,
    ...Platform.select({
      android: {
        height: "100%",
        paddingVertical: 0,
        includeFontPadding: false,
        textAlignVertical: "center",
        lineHeight: 26,
      },
      ios: {
        lineHeight: 30,
        paddingVertical: 2,
      },
    }),
  },
});
