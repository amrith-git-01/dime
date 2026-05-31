import { ManualAddTransactionEditor } from "@/components/transactions/bento/ManualAddTransactionEditor";
import { MAX_CUSTOM_CATEGORIES } from "@/features/categories/constants/limits";
import {
  useLocalCategories,
  type LocalCategory,
} from "@/features/categories/hooks/useLocalCategories";
import { useToast } from "@/features/toast/useToast";
import { useManualAddScreenLifecycle } from "@/features/transactions/hooks/useManualAddScreenLifecycle";
import { useManualAddTransactionForm } from "@/features/transactions/hooks/useManualAddTransactionForm";
import { useSubmitManualTransactionMutation } from "@/features/transactions/hooks/useSubmitManualTransactionMutation";
import { findIncomeCategory } from "@/features/transactions/utils/manualAddCategoryUtils";
import { useSessionUserId } from "@/hooks/useSessionUserId";
import { triggerLightHaptic } from "@/lib/haptics/nativeHaptics";
import type { MainStackParamList } from "@/navigation/types";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import type { RouteProp } from "@react-navigation/native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useMemo, useState } from "react";
import { Alert, Keyboard, Platform } from "react-native";

type ManualAddRoute = RouteProp<MainStackParamList, "ManualAddTransaction">;

export default function ManualAddTransactionScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<ManualAddRoute>();
  const { userId, authReady } = useSessionUserId();
  const submitMutation = useSubmitManualTransactionMutation();
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

  const handleClear = useCallback(() => {
    void triggerLightHaptic();
    Keyboard.dismiss();
    form.reset();
    resetUiState();
    submitMutation.reset();
  }, [form.reset, resetUiState, submitMutation]);

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
    const selectedCategory = categories.find((c) => c.id === form.categoryId);
    try {
      await submitMutation.mutateAsync({
        body: payload,
        categoryMeta: {
          categoryName: selectedCategory?.name ?? payload.category,
          categoryIconName: selectedCategory?.icon_name ?? null,
          categoryColor: selectedCategory?.color ?? null,
        },
      });
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
    categories,
    form.buildPayload,
    form.categoryId,
    navigation,
    showToast,
    submitMutation,
    userId,
  ]);

  const setExpenseType = useCallback(() => {
    void triggerLightHaptic();
    form.setTxType("debit");
  }, [form.setTxType]);

  const setIncomeType = useCallback(() => {
    void triggerLightHaptic();
    form.setTxType("credit");
  }, [form.setTxType]);

  const handleCategoryPress = useCallback(
    (category: LocalCategory, selected: boolean) => {
      void triggerLightHaptic();
      if (selected) {
        form.clearCategory();
        return;
      }
      form.selectCategory(category.id, category.name);
    },
    [form.clearCategory, form.selectCategory],
  );

  const handleIosDateChange = useCallback(
    (date: Date | undefined) => {
      setIosPickerVisible(false);
      if (date) {
        form.setTransactionAt(date);
      }
    },
    [form.setTransactionAt],
  );

  return (
    <ManualAddTransactionEditor
      amountText={form.amountText}
      amountFocused={amountFocused}
      onAmountChange={form.setAmountText}
      onAmountFocus={() => setAmountFocused(true)}
      onAmountBlur={() => setAmountFocused(false)}
      txType={form.txType}
      onSetExpense={setExpenseType}
      onSetIncome={setIncomeType}
      counterpartyType={form.counterpartyType}
      onCounterpartyTypeChange={form.setCounterpartyType}
      counterpartyName={form.counterpartyName}
      onCounterpartyNameChange={form.setCounterpartyName}
      categoriesLoading={categoriesLoading}
      visibleCategories={visibleCategories}
      categoryId={form.categoryId}
      onCategoryPress={handleCategoryPress}
      onAddCategory={openCreateCustomCategory}
      addCategoryDisabled={customCategoryCount >= MAX_CUSTOM_CATEGORIES}
      note={form.note}
      onNoteChange={form.setNote}
      transactionAt={form.transactionAt}
      onDatePress={onDateRowPress}
      iosPickerVisible={iosPickerVisible}
      onIosDateChange={handleIosDateChange}
      saveLoading={submitMutation.isPending}
      onSave={() => {
        void onSave();
      }}
      onClear={handleClear}
    />
  );
}
