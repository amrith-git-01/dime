import { getDaysInMonth } from "date-fns";
import type { RouteProp } from "@react-navigation/native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useState } from "react";
import { Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button/Button";
import { TextField } from "@/components/ui/TextField/TextField";
import { fontFamilies } from "@/constants/fonts";
import { colors, spacing, typography } from "@/constants/theme";
import {
  useBudgetQuery,
  useUpsertBudgetMutation,
} from "@/features/budgets/hooks/useBudget";
import { useToast } from "@/features/toast/useToast";
import type { MainStackParamList } from "@/navigation/types";

type EditRoute = RouteProp<MainStackParamList, "EditMonthlyBudget">;
type StackNav = NativeStackNavigationProp<MainStackParamList>;

export default function EditMonthlyBudgetScreen() {
  const navigation = useNavigation<StackNav>();
  const route = useRoute<EditRoute>();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const { data: budgetResp, isPending: isBudgetLoading } = useBudgetQuery();
  const upsertBudgetMutation = useUpsertBudgetMutation();

  const existingBudget = budgetResp?.budget
    ? Number.parseFloat(budgetResp.budget.monthly_budget)
    : 0;
  const hasMonthlyBudget =
    Number.isFinite(existingBudget) && existingBudget > 0;
  const isEditMode = route.params?.mode === "edit" || hasMonthlyBudget;

  const now = new Date();
  const selectedYear = route.params?.selectedYear ?? now.getFullYear();
  const selectedMonthIndex0 =
    route.params?.selectedMonthIndex0 ?? now.getMonth();

  const [monthlyBudgetText, setMonthlyBudgetText] = useState("");

  useEffect(() => {
    if (hasMonthlyBudget) {
      setMonthlyBudgetText(String(Math.round(existingBudget)));
      return;
    }
    setMonthlyBudgetText("");
  }, [existingBudget, hasMonthlyBudget]);

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

  const handleSave = useCallback(() => {
    const parsed = Number.parseFloat(monthlyBudgetText);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return;
    }

    if (hasMonthlyBudget && Math.abs(parsed - existingBudget) < 0.0001) {
      navigation.goBack();
      return;
    }

    upsertBudgetMutation.mutate(
      { amount: parsed },
      {
        onSuccess: () => {
          showToast({ variant: "success", message: "Budget saved" });
          navigation.goBack();
        },
      },
    );
  }, [
    existingBudget,
    hasMonthlyBudget,
    monthlyBudgetText,
    navigation,
    showToast,
    upsertBudgetMutation,
  ]);

  const handleCancel = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  return (
    <KeyboardAwareScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.scrollContent,
        { paddingBottom: spacing.xl + insets.bottom },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.editorCard}>
        <Text style={styles.editorLabel}>
          {isEditMode ? "Update budget" : "Monthly budget"}
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
            onChangeText={setMonthlyBudgetText}
            underlineColorAndroid="transparent"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={handleSave}
          />
        </View>
        <View style={styles.editorActionsRow}>
          <View style={styles.actionButtonWrap}>
            <Button
              title={isEditMode ? "Update" : "Save"}
              loading={upsertBudgetMutation.isPending}
              onPress={handleSave}
              disabled={isBudgetLoading}
            />
          </View>
          {isEditMode ? (
            <View style={styles.actionButtonWrap}>
              <Button
                title="Cancel"
                variant="secondary"
                onPress={handleCancel}
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
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.pageBackground,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  editorCard: {
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
