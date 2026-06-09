import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useRef } from "react";

import type { CategoryRow } from "@/features/categories/types";
import type { MainStackParamList } from "@/navigation/types";

import type { TransactionType } from "../types";
import {
  findIncomeCategory,
  isCategoryAllowedForTxType,
} from "../utils/manualAddCategoryUtils";

type FormControls = {
  reset: () => void;
  selectCategory: (id: string, name: string) => void;
  clearCategory: () => void;
  categoryId: string | null;
  txType: TransactionType;
};

type UseManualAddScreenLifecycleParams = {
  form: FormControls;
  categories: CategoryRow[];
  navigation: NativeStackNavigationProp<MainStackParamList>;
  returnCategoryId?: string;
  returnCategoryName?: string;
  onResetUi: () => void;
  onSubmitMutationReset: () => void;
};

export function useManualAddScreenLifecycle({
  form,
  categories,
  navigation,
  returnCategoryId,
  returnCategoryName,
  onResetUi,
  onSubmitMutationReset,
}: UseManualAddScreenLifecycleParams) {
  const { categoryId, clearCategory, reset, selectCategory, txType } = form;
  const navigatedToCreateCategoryRef = useRef(false);
  const pendingReturnCategoryIdRef = useRef<string | null>(null);
  const consumedReturnCategoryRef = useRef(false);
  const hasFocusedOnceRef = useRef(false);

  const markNavigatedToCreateCategory = useCallback(() => {
    navigatedToCreateCategoryRef.current = true;
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (navigatedToCreateCategoryRef.current) {
        navigatedToCreateCategoryRef.current = false;
        return () => undefined;
      }

      if (returnCategoryId && !consumedReturnCategoryRef.current) {
        consumedReturnCategoryRef.current = true;
        hasFocusedOnceRef.current = true;
        pendingReturnCategoryIdRef.current = returnCategoryId;
        selectCategory(returnCategoryId, returnCategoryName ?? "");
        navigation.setParams({
          createdCategoryId: undefined,
          createdCategoryName: undefined,
        });
        return () => undefined;
      }

      if (!hasFocusedOnceRef.current) {
        hasFocusedOnceRef.current = true;
        const frame = requestAnimationFrame(() => {
          pendingReturnCategoryIdRef.current = null;
          consumedReturnCategoryRef.current = false;
          reset();
          onSubmitMutationReset();
          onResetUi();
        });
        return () => {
          cancelAnimationFrame(frame);
          hasFocusedOnceRef.current = false;
        };
      }

      return () => undefined;
    }, [
      navigation,
      onResetUi,
      onSubmitMutationReset,
      returnCategoryId,
      returnCategoryName,
      reset,
      selectCategory,
    ]),
  );

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

  return { markNavigatedToCreateCategory };
}
