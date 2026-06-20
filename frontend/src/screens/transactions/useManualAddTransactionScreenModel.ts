import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import type { RouteProp } from "@react-navigation/native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useMemo, useState } from "react";
import { Alert, Keyboard, Platform } from "react-native";

import { MAX_CUSTOM_CATEGORIES } from "@/features/categories/constants/limits";
import { useCategories } from "@/features/categories/hooks/useCategories";
import type { CategoryRow } from "@/features/categories/types";
import { useToast } from "@/features/toast/useToast";
import type { ManualAddDateTimePickerMode } from "@/features/transactions/components/bento/ManualAddDateField";
import { useManualAddScreenLifecycle } from "@/features/transactions/hooks/useManualAddScreenLifecycle";
import { useManualAddTransactionForm } from "@/features/transactions/hooks/useManualAddTransactionForm";
import { useSubmitManualTransactionMutation } from "@/features/transactions/hooks/useSubmitManualTransactionMutation";
import { findIncomeCategory } from "@/features/transactions/utils/manualAddCategoryUtils";
import { useSessionUserId } from "@/hooks/useSessionUserId";
import { triggerLightHaptic } from "@/lib/haptics/nativeHaptics";
import type { MainStackParamList } from "@/navigation/types";
import { mergeDateWithTime } from "@/utils/dateTime";

type ManualAddRoute = RouteProp<MainStackParamList, "ManualAddTransaction">;

export function useManualAddTransactionScreenModel() {
  const navigation =
    useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<ManualAddRoute>();
  const { userId, authReady } = useSessionUserId();
  const submitMutation = useSubmitManualTransactionMutation();
  const { showToast } = useToast();
  const form = useManualAddTransactionForm();
  const {
    amountText,
    buildPayload,
    categoryId,
    clearCategory,
    counterpartyName,
    counterpartyType,
    note,
    reset,
    selectCategory,
    setAmountText,
    setCounterpartyName,
    setCounterpartyType,
    setNote,
    setTransactionAt,
    setTxType,
    transactionAt,
    txType,
  } = form;
  const { categories, isLoading: categoriesLoading } = useCategories();

  const [amountFocused, setAmountFocused] = useState(false);
  const [iosPickerMode, setIosPickerMode] =
    useState<ManualAddDateTimePickerMode>(null);

  const resetUiState = useCallback(() => {
    setIosPickerMode(null);
    setAmountFocused(false);
  }, []);

  const { markNavigatedToCreateCategory } = useManualAddScreenLifecycle({
    form: {
      reset,
      selectCategory,
      clearCategory,
      categoryId,
      txType,
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
    if (txType === "credit") {
      const income = findIncomeCategory(categories);
      return income ? [income] : categories;
    }
    return categories.filter((category) => category.name !== "Income");
  }, [categories, txType]);

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
    reset();
    resetUiState();
    submitMutation.reset();
  }, [reset, resetUiState, submitMutation]);

  const openAndroidDatePicker = useCallback(() => {
    void triggerLightHaptic();
    DateTimePickerAndroid.open({
      value: transactionAt,
      mode: "date",
      onChange: (_event, date) => {
        if (date) {
          setTransactionAt((prev) => mergeDateWithTime(date, prev));
        }
      },
    });
  }, [setTransactionAt, transactionAt]);

  const openAndroidTimePicker = useCallback(() => {
    void triggerLightHaptic();
    DateTimePickerAndroid.open({
      value: transactionAt,
      mode: "time",
      onChange: (_event, date) => {
        if (date) {
          setTransactionAt((prev) => mergeDateWithTime(prev, date));
        }
      },
    });
  }, [setTransactionAt, transactionAt]);

  const onDateRowPress = useCallback(() => {
    if (Platform.OS === "android") {
      openAndroidDatePicker();
    } else {
      void triggerLightHaptic();
      setIosPickerMode((current) => (current === "date" ? null : "date"));
    }
  }, [openAndroidDatePicker]);

  const onTimeRowPress = useCallback(() => {
    if (Platform.OS === "android") {
      openAndroidTimePicker();
    } else {
      void triggerLightHaptic();
      setIosPickerMode((current) => (current === "time" ? null : "time"));
    }
  }, [openAndroidTimePicker]);

  const onSave = useCallback(async () => {
    if (!authReady || !userId) {
      Alert.alert("Sign in required", "Sign in to add a transaction.");
      return;
    }
    const payload = buildPayload();
    if (!payload) {
      Alert.alert(
        "Check fields",
        "Enter a positive amount and a counterparty name.",
      );
      return;
    }
    try {
      await submitMutation.mutateAsync({ body: payload });
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
  }, [authReady, buildPayload, navigation, showToast, submitMutation, userId]);

  const setExpenseType = useCallback(() => {
    void triggerLightHaptic();
    setTxType("debit");
  }, [setTxType]);

  const setIncomeType = useCallback(() => {
    void triggerLightHaptic();
    setTxType("credit");
  }, [setTxType]);

  const handleCategoryPress = useCallback(
    (category: CategoryRow, selected: boolean) => {
      void triggerLightHaptic();
      if (selected) {
        clearCategory();
        return;
      }
      selectCategory(category.id, category.name);
    },
    [clearCategory, selectCategory],
  );

  const handleIosPickerChange = useCallback(
    (mode: "date" | "time", date: Date | undefined) => {
      setIosPickerMode(null);
      if (!date) {
        return;
      }
      if (mode === "date") {
        setTransactionAt((prev) => mergeDateWithTime(date, prev));
        return;
      }
      setTransactionAt((prev) => mergeDateWithTime(prev, date));
    },
    [setTransactionAt],
  );

  return {
    amountText,
    amountFocused,
    setAmountText,
    setAmountFocused,
    txType,
    setExpenseType,
    setIncomeType,
    counterpartyType,
    setCounterpartyType,
    counterpartyName,
    setCounterpartyName,
    categoriesLoading,
    visibleCategories,
    categoryId,
    handleCategoryPress,
    openCreateCustomCategory,
    addCategoryDisabled: customCategoryCount >= MAX_CUSTOM_CATEGORIES,
    note,
    setNote,
    transactionAt,
    onDateRowPress,
    onTimeRowPress,
    iosPickerMode,
    handleIosPickerChange,
    saveLoading: submitMutation.isPending,
    onSave,
    handleClear,
  };
}
