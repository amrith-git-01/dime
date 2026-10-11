import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import type { RouteProp } from "@react-navigation/native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Keyboard, Platform } from "react-native";

import { MAX_CUSTOM_CATEGORIES } from "@/features/categories/constants/limits";
import { useCategories } from "@/features/categories/hooks/useCategories";
import type { CategoryRow } from "@/features/categories/types";
import { useToast } from "@/features/toast/useToast";
import type { ManualAddDateTimePickerMode } from "@/features/transactions/components";
import { useManualAddTransactionForm } from "@/features/transactions/hooks/useManualAddTransactionForm";
import { useUpdateTransactionMutation } from "@/features/transactions/hooks/useUpdateTransactionMutation";
import {
  findIncomeCategory,
  isCategoryAllowedForTxType,
} from "@/features/transactions/utils/manualAddCategoryUtils";
import { transactionRowToFormState } from "@/features/transactions/utils/transactionRowToFormState";
import { useSessionUserId } from "@/hooks/useSessionUserId";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";
import type { MainStackParamList } from "@/navigation/types";
import { mergeDateWithTime } from "@/utils/dateTime";

type EditRoute = RouteProp<MainStackParamList, "EditTransaction">;

export function useEditTransactionScreenModel() {
  const navigation =
    useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<EditRoute>();
  const { userId } = useSessionUserId();
  const { showToast } = useToast();
  const transaction = route.params.transaction;
  const { categories, isLoading: categoriesLoading } = useCategories();

  const baseline = useMemo(
    () => (transaction ? transactionRowToFormState(transaction) : undefined),
    [transaction],
  );
  const form = useManualAddTransactionForm(baseline);
  const {
    amountText,
    applySnapshot,
    buildPayload,
    categoryId,
    clearCategory,
    counterpartyName,
    counterpartyType,
    note,
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
  const updateMutation = useUpdateTransactionMutation();
  const pendingReturnCategoryIdRef = useRef<string | null>(null);

  const [amountFocused, setAmountFocused] = useState(false);
  const [iosPickerMode, setIosPickerMode] =
    useState<ManualAddDateTimePickerMode>(null);

  useEffect(() => {
    if (transaction) {
      return;
    }
    showToast({ variant: "error", message: "Transaction not found" });
    navigation.goBack();
  }, [navigation, showToast, transaction]);

  useEffect(() => {
    const id = route.params.createdCategoryId;
    if (!id) {
      return;
    }
    pendingReturnCategoryIdRef.current = id;
    selectCategory(id, route.params.createdCategoryName ?? "");
    navigation.setParams({
      createdCategoryId: undefined,
      createdCategoryName: undefined,
    });
  }, [
    navigation,
    route.params.createdCategoryId,
    route.params.createdCategoryName,
    selectCategory,
  ]);

  useEffect(() => {
    const pendingId = pendingReturnCategoryIdRef.current;
    if (!pendingId) {
      return;
    }
    const match = categories.find((category) => category.id === pendingId);
    if (match) {
      selectCategory(match.id, match.name);
      pendingReturnCategoryIdRef.current = null;
    }
  }, [categories, selectCategory]);

  useEffect(() => {
    if (categories.length === 0) {
      return;
    }
    const current = categoryId
      ? categories.find((category) => category.id === categoryId)
      : undefined;
    if (txType === "credit") {
      if (current && isCategoryAllowedForTxType(current, "credit")) {
        return;
      }
      const income = findIncomeCategory(categories);
      if (income) {
        selectCategory(income.id, income.name);
      } else {
        clearCategory();
      }
      return;
    }
    if (current && !isCategoryAllowedForTxType(current, "debit")) {
      clearCategory();
    }
  }, [categories, categoryId, clearCategory, selectCategory, txType]);

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
    navigation.navigate("CreateCustomCategory", {
      origin: "edit-transaction",
    });
  }, [customCategoryCount, navigation, showToast]);

  const handleClear = useCallback(() => {
    if (!baseline) {
      return;
    }
    void triggerHaptic();
    Keyboard.dismiss();
    applySnapshot(baseline);
    setIosPickerMode(null);
    setAmountFocused(false);
    updateMutation.reset();
  }, [applySnapshot, baseline, updateMutation]);

  const openAndroidDatePicker = useCallback(() => {
    void triggerHaptic();
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
    void triggerHaptic();
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
      void triggerHaptic();
      setIosPickerMode((current) => (current === "date" ? null : "date"));
    }
  }, [openAndroidDatePicker]);

  const onTimeRowPress = useCallback(() => {
    if (Platform.OS === "android") {
      openAndroidTimePicker();
    } else {
      void triggerHaptic();
      setIosPickerMode((current) => (current === "time" ? null : "time"));
    }
  }, [openAndroidTimePicker]);

  const onSave = useCallback(async () => {
    if (!userId) {
      Alert.alert("Sign in required", "Sign in to save this transaction.");
      return;
    }
    if (!transaction) {
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
    const { detected_via: _ignored, ...body } = payload;
    try {
      await updateMutation.mutateAsync({ id: transaction.id, body });
      showToast({ variant: "success", message: "Transaction updated" });
      navigation.goBack();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not save transaction.";
      if (/not found/i.test(message)) {
        showToast({ variant: "error", message: "Transaction not found." });
        navigation.goBack();
        return;
      }
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
    buildPayload,
    navigation,
    showToast,
    transaction,
    updateMutation,
    userId,
  ]);

  const setExpenseType = useCallback(() => {
    void triggerHaptic();
    setTxType("debit");
  }, [setTxType]);

  const setIncomeType = useCallback(() => {
    void triggerHaptic();
    setTxType("credit");
  }, [setTxType]);

  const handleCategoryPress = useCallback(
    (category: CategoryRow, selected: boolean) => {
      void triggerHaptic();
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
    saveLoading: updateMutation.isPending,
    onSave,
    handleClear,
  };
}

