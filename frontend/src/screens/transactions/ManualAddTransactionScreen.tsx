import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import type { RouteProp } from "@react-navigation/native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ChevronRight } from "lucide-react-native";
import { memo, useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button/Button";
import { SelectDropdown } from "@/components/ui/SelectDropdown/SelectDropdown";
import { TextField } from "@/components/ui/TextField/TextField";
import { fontFamilies } from "@/constants/fonts";
import { formStyles } from "@/constants/formStyles";
import { colors, spacing } from "@/constants/theme";
import { AddCategoryTrigger } from "@/features/categories/components/AddCategoryTrigger";
import { CategoryLucideIcon } from "@/features/categories/components/CategoryLucideIcon";
import { MAX_CUSTOM_CATEGORIES } from "@/features/categories/constants/limits";
import { useLocalCategories } from "@/features/categories/hooks/useLocalCategories";
import { useToast } from "@/features/toast/useToast";
import { submitManualTransaction } from "@/features/transactions/api/submitTransactionApi";
import { COUNTERPARTY_TYPE_OPTIONS } from "@/features/transactions/counterpartyTypes";
import { useManualAddScreenLifecycle } from "@/features/transactions/hooks/useManualAddScreenLifecycle";
import { useManualAddTransactionForm } from "@/features/transactions/hooks/useManualAddTransactionForm";
import { transactionsQueryKeys } from "@/features/transactions/queryKeys";
import { findIncomeCategory } from "@/features/transactions/utils/manualAddCategoryUtils";
import { useSessionUserId } from "@/hooks/useSessionUserId";
import { triggerLightHaptic } from "@/lib/haptics/nativeHaptics";
import type { MainStackParamList } from "@/navigation/types";

const SEGMENT_SELECTED_BG = "rgba(99, 85, 232, 0.10)";

type ManualAddRoute = RouteProp<MainStackParamList, "ManualAddTransaction">;

export default function ManualAddTransactionScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<ManualAddRoute>();
  const insets = useSafeAreaInsets();
  const { userId, authReady } = useSessionUserId();
  const queryClient = useQueryClient();
  const submitMutation = useMutation({
    mutationFn: submitManualTransaction,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: transactionsQueryKeys.all,
      });
    },
  });
  const { showToast } = useToast();
  const form = useManualAddTransactionForm();
  const { data: categories, loading: categoriesLoading } = useLocalCategories();

  const [amountFocused, setAmountFocused] = useState(false);
  const [iosPickerVisible, setIosPickerVisible] = useState(false);

  const resetUiState = useCallback(() => {
    setIosPickerVisible(false);
    setAmountFocused(false);
  }, []);

  const { markNavigatedToCreateCategory } = useManualAddScreenLifecycle({
    form: {
      reset: form.reset,
      selectCategory: form.selectCategory,
      clearCategory: form.clearCategory,
      categoryId: form.categoryId,
      txType: form.txType,
    },
    categories,
    navigation,
    returnCategoryId: route.params?.createdCategoryId,
    returnCategoryName: route.params?.createdCategoryName,
    onResetUi: resetUiState,
    onSubmitMutationReset: submitMutation.reset,
  });

  const customCategoryCount = useMemo(
    () => categories.filter((category) => !category.is_system).length,
    [categories],
  );

  const visibleCategories = useMemo(() => {
    if (form.txType === "credit") {
      const income = findIncomeCategory(categories);
      return income ? [income] : categories;
    }
    return categories.filter((category) => category.name !== "Income");
  }, [categories, form.txType]);

  const openCreateCustomCategory = useCallback(() => {
    if (customCategoryCount >= MAX_CUSTOM_CATEGORIES) {
      showToast({
        variant: "error",
        message: `Maximum ${MAX_CUSTOM_CATEGORIES} custom categories`,
      });
      return;
    }
    markNavigatedToCreateCategory();
    navigation.navigate("CreateCustomCategory", { origin: "manual-add" });
  }, [
    customCategoryCount,
    markNavigatedToCreateCategory,
    navigation,
    showToast,
  ]);

  const leave = useCallback(() => {
    void triggerLightHaptic();
    Keyboard.dismiss();
    navigation.goBack();
  }, [navigation]);

  const openAndroidDatePicker = useCallback(() => {
    void triggerLightHaptic();
    DateTimePickerAndroid.open({
      value: form.transactionAt,
      mode: "date",
      onChange: (_event, date) => {
        if (date) {
          form.setTransactionAt(date);
        }
      },
    });
  }, [form.setTransactionAt, form.transactionAt]);

  const onDateRowPress = useCallback(() => {
    if (Platform.OS === "android") {
      openAndroidDatePicker();
    } else {
      void triggerLightHaptic();
      setIosPickerVisible(true);
    }
  }, [openAndroidDatePicker]);

  const onSave = useCallback(async () => {
    if (!authReady || !userId) {
      Alert.alert("Sign in required", "Sign in to add a transaction.");
      return;
    }
    const payload = form.buildPayload();
    if (!payload) {
      Alert.alert(
        "Check fields",
        "Enter a positive amount and a counterparty name.",
      );
      return;
    }
    try {
      await submitMutation.mutateAsync(payload);
      showToast({
        variant: "success",
        message: "Transaction added",
      });
      navigation.goBack();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not save transaction.";
      showToast({
        variant: "error",
        message: message.length > 0 ? message : "Could not save transaction",
        action: {
          label: "Retry",
          onPress: () => {
            void onSave();
          },
        },
      });
    }
  }, [
    authReady,
    form.buildPayload,
    navigation,
    showToast,
    submitMutation,
    userId,
  ]);

  const optionalTag = <Text style={styles.optionalHint}>(optional)</Text>;

  const setExpenseType = useCallback(() => {
    void triggerLightHaptic();
    form.setTxType("debit");
  }, [form.setTxType]);

  const setIncomeType = useCallback(() => {
    void triggerLightHaptic();
    form.setTxType("credit");
  }, [form.setTxType]);

  return (
    <KeyboardAwareScrollView
      style={styles.screen}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      bottomOffset={24}
      contentContainerStyle={[
        styles.scrollContent,
        { paddingBottom: spacing.xl + insets.bottom },
      ]}
    >
      <View style={styles.fieldBlock}>
        <Text style={formStyles.fieldLabel}>Amount</Text>
        <View
          style={[
            formStyles.fieldShell,
            styles.amountShellMin,
            amountFocused && formStyles.fieldShellFocused,
          ]}
        >
          <View style={styles.currencyPrefixWrap}>
            <Text style={styles.currencyPrefix}>₹</Text>
          </View>
          <TextInput
            style={styles.amountInput}
            placeholder="0.00"
            placeholderTextColor={colors.inactive}
            keyboardType="decimal-pad"
            value={form.amountText}
            onChangeText={form.setAmountText}
            onFocus={() => setAmountFocused(true)}
            onBlur={() => setAmountFocused(false)}
            underlineColorAndroid="transparent"
          />
        </View>
      </View>

      <Text style={[formStyles.fieldLabel, styles.segmentLabel]}>Type</Text>
      <View style={styles.segmentRow}>
        <SegmentChip
          label="Expense"
          selected={form.txType === "debit"}
          onPress={setExpenseType}
        />
        <SegmentChip
          label="Income"
          selected={form.txType === "credit"}
          onPress={setIncomeType}
        />
      </View>

      <View style={styles.fieldBlock}>
        <SelectDropdown
          label="Counterparty type"
          options={COUNTERPARTY_TYPE_OPTIONS}
          value={form.counterpartyType}
          onChange={form.setCounterpartyType}
          placeholder="Select type"
        />
      </View>

      <View style={styles.fieldBlock}>
        <TextField
          label="Counterparty name"
          placeholder="Who or what was this for?"
          value={form.counterpartyName}
          onChangeText={form.setCounterpartyName}
        />
      </View>

      <View style={styles.fieldBlock}>
        <View style={styles.labelRow}>
          <Text style={formStyles.fieldLabel}>Category</Text>
          {optionalTag}
        </View>
        {categoriesLoading ? (
          <View style={styles.categoriesLoading}>
            <ActivityIndicator color={colors.headerGradientStart} />
          </View>
        ) : (
          <View style={styles.categoryGrid}>
            {visibleCategories.map((category) => {
              const selected = form.categoryId === category.id;
              return (
                <CategoryPill
                  key={category.id}
                  label={category.name}
                  iconName={category.icon_name}
                  iconColor={category.color}
                  selected={selected}
                  onPress={() => {
                    void triggerLightHaptic();
                    if (selected) {
                      form.clearCategory();
                      return;
                    }
                    form.selectCategory(category.id, category.name);
                  }}
                />
              );
            })}
            <AddCategoryTrigger
              disabled={customCategoryCount >= MAX_CUSTOM_CATEGORIES}
              onPress={openCreateCustomCategory}
            />
          </View>
        )}
      </View>

      <View style={styles.fieldBlock}>
        <TextField
          label="Note"
          labelRight={optionalTag}
          placeholder="Add a short note"
          value={form.note}
          onChangeText={form.setNote}
        />
      </View>

      <Text style={[formStyles.fieldLabel, styles.dateLabel]}>Date</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onDateRowPress}
        style={({ pressed }) => [
          styles.dateRow,
          pressed && styles.dateRowPressed,
        ]}
      >
        <Text style={styles.dateValue}>
          {format(form.transactionAt, "MMM d, yyyy")}
        </Text>
        <ChevronRight size={20} color={colors.inactive} strokeWidth={2} />
      </Pressable>

      {iosPickerVisible ? (
        <View style={styles.iosPickerWrap}>
          <DateTimePicker
            value={form.transactionAt}
            mode="date"
            display="compact"
            themeVariant="light"
            onChange={(_e, date) => {
              setIosPickerVisible(false);
              if (date) {
                form.setTransactionAt(date);
              }
            }}
          />
        </View>
      ) : null}

      <View style={styles.footerActions}>
        <Button
          title="Save"
          loading={submitMutation.isPending}
          onPress={() => {
            void onSave();
          }}
        />
        <Button variant="secondary" title="Cancel" onPress={leave} />
      </View>
    </KeyboardAwareScrollView>
  );
}

type SegmentChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
};

const SegmentChip = memo(function SegmentChip({
  label,
  selected,
  onPress,
}: SegmentChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.segmentChip,
        selected && styles.segmentChipSelected,
        pressed && styles.segmentChipPressed,
      ]}
    >
      <Text
        style={[styles.segmentChipText, selected && styles.segmentChipTextOn]}
      >
        {label}
      </Text>
    </Pressable>
  );
});

type CategoryPillProps = {
  label: string;
  iconName: string;
  iconColor: string;
  selected: boolean;
  onPress: () => void;
};

const CategoryPill = memo(function CategoryPill({
  label,
  iconName,
  iconColor,
  selected,
  onPress,
}: CategoryPillProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.categoryPill,
        selected && styles.categoryPillSelected,
        pressed && styles.categoryPillPressed,
      ]}
    >
      <CategoryLucideIcon
        iconName={iconName}
        color={iconColor}
        size={16}
        strokeWidth={1.5}
      />
      <Text
        style={[
          styles.categoryPillLabel,
          selected && styles.categoryPillLabelOn,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.pageBackground,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  fieldBlock: {
    marginBottom: spacing.xl,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  segmentLabel: {
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  optionalHint: {
    fontFamily: fontFamilies.regular,
    color: colors.inactive,
    fontSize: 12,
  },
  categoriesLoading: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.pageBackground,
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  categoryPill: {
    maxWidth: "100%",
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.pageBackground,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  categoryPillSelected: {
    borderColor: colors.primary,
    backgroundColor: SEGMENT_SELECTED_BG,
  },
  categoryPillPressed: {
    opacity: 0.92,
  },
  categoryPillLabel: {
    flexShrink: 0,
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  categoryPillLabelOn: {
    color: colors.textPrimary,
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
  segmentRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  segmentChip: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.pageBackground,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  segmentChipSelected: {
    backgroundColor: SEGMENT_SELECTED_BG,
    borderColor: colors.primary,
  },
  segmentChipPressed: {
    opacity: 0.92,
  },
  segmentChipText: {
    fontFamily: fontFamilies.medium,
    fontSize: 15,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  segmentChipTextOn: {
    color: colors.textPrimary,
  },
  dateLabel: {
    marginBottom: spacing.sm,
  },
  dateRow: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
    backgroundColor: colors.barBackground,
  },
  dateRowPressed: {
    backgroundColor: colors.pageBackground,
  },
  dateValue: {
    fontFamily: fontFamilies.regular,
    fontSize: 16,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  footerActions: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  iosPickerWrap: {
    marginBottom: spacing.md,
    alignItems: "flex-start",
  },
});
