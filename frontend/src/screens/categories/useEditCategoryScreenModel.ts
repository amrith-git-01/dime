import type { RouteProp } from "@react-navigation/native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useMemo, useState } from "react";
import { Alert, Keyboard } from "react-native";

import { useCategoryBudgetsQuery } from "@/features/budgets/hooks/useCategoryBudgetsQuery";
import {
  DEFAULT_CUSTOM_CATEGORY_COLOR,
  DEFAULT_CUSTOM_CATEGORY_ICON,
  type CustomCategoryIconName,
} from "@/features/categories/constants/customCategoryPresets";
import { useCategories } from "@/features/categories/hooks/useCategories";
import {
  useDeleteCategoryMutation,
  useUpdateCategoryMutation,
} from "@/features/categories/hooks/useCategoryMutations";
import { parseBudgetAmount } from "@/features/categories/utils/parseBudgetAmount";
import { useToast } from "@/features/toast/useToast";
import { isTourSampleId } from "@/features/tourPreview";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";
import type { MainStackParamList } from "@/navigation/types";

type EditRoute = RouteProp<MainStackParamList, "EditCategory">;
type StackNav = NativeStackNavigationProp<MainStackParamList>;

type CategoryDraft = {
  name: string;
  iconName: CustomCategoryIconName;
  color: string;
  monthlyBudget: string;
};

/** Fields the user has touched, scoped to one category so a route change starts clean. */
type DraftEdits = { categoryId: string; fields: Partial<CategoryDraft> };

export function useEditCategoryScreenModel() {
  const navigation = useNavigation<StackNav>();
  const route = useRoute<EditRoute>();
  const { showToast } = useToast();
  const categoryId = route.params.categoryId;

  const { categories } = useCategories("spend");
  const { data: categoryBudgets = [] } = useCategoryBudgetsQuery();
  const updateMutation = useUpdateCategoryMutation();
  const deleteMutation = useDeleteCategoryMutation();

  const category = useMemo(
    () => categories.find((row) => row.id === categoryId),
    [categories, categoryId],
  );

  const initialBudget = useMemo(() => {
    const match = categoryBudgets.find((row) => row.category_id === categoryId);
    if (!match) {
      return "";
    }
    const amount = Number.parseFloat(match.monthly_amount);
    return Number.isFinite(amount) && amount > 0 ? String(amount) : "";
  }, [categoryBudgets, categoryId]);

  const savedBaseline = useMemo<CategoryDraft>(
    () => ({
      name: category?.name ?? "",
      iconName:
        (category?.icon_name as CustomCategoryIconName) ??
        DEFAULT_CUSTOM_CATEGORY_ICON,
      color: category?.color ?? DEFAULT_CUSTOM_CATEGORY_COLOR,
      monthlyBudget: initialBudget,
    }),
    [category, initialBudget],
  );

  // Server data (incl. realtime refreshes) only flows into fields the user has not edited.
  const [edits, setEdits] = useState<DraftEdits>({ categoryId, fields: {} });
  const editedFields = edits.categoryId === categoryId ? edits.fields : {};
  const draft: CategoryDraft = { ...savedBaseline, ...editedFields };

  const setField = useCallback(
    <K extends keyof CategoryDraft>(key: K, value: CategoryDraft[K]) => {
      setEdits((prev) => ({
        categoryId,
        fields: {
          ...(prev.categoryId === categoryId ? prev.fields : {}),
          [key]: value,
        },
      }));
    },
    [categoryId],
  );

  const [deleteSheetVisible, setDeleteSheetVisible] = useState(false);

  const fieldsDisabled = category?.is_system ?? false;

  const handleSave = useCallback(async () => {
    if (isTourSampleId(categoryId)) {
      navigation.goBack();
      return;
    }
    if (!category) {
      Alert.alert("Category not found", "Go back and try again.");
      return;
    }

    const trimmed = draft.name.trim();
    if (!fieldsDisabled && !trimmed) {
      Alert.alert("Name required", "Enter a category name.");
      return;
    }

    const amount = parseBudgetAmount(draft.monthlyBudget);
    if (draft.monthlyBudget.trim() && amount == null) {
      Alert.alert("Invalid budget", "Enter a valid monthly budget amount.");
      return;
    }

    // One atomic PATCH: category fields and budget travel together (C1).
    const budgetChanged = draft.monthlyBudget.trim() !== initialBudget;
    const payload = {
      ...(fieldsDisabled
        ? {}
        : { name: trimmed, icon_name: draft.iconName, color: draft.color }),
      ...(budgetChanged
        ? { budget_amount: amount == null ? null : amount.toFixed(2) }
        : {}),
    };

    try {
      if (Object.keys(payload).length > 0) {
        await updateMutation.mutateAsync({ categoryId, payload });
      }
      showToast({ variant: "success", message: "Category saved" });
      navigation.goBack();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not save category.";
      showToast({ variant: "error", message: "Could not save category" });
      Alert.alert("Something went wrong", message);
    }
  }, [
    category,
    categoryId,
    draft.color,
    draft.iconName,
    draft.monthlyBudget,
    draft.name,
    fieldsDisabled,
    initialBudget,
    navigation,
    showToast,
    updateMutation,
  ]);

  const onSavePress = useCallback(() => {
    void triggerHaptic();
    void handleSave();
  }, [handleSave]);

  const handleConfirmDelete = useCallback(
    (reassignToCategoryId?: string) => {
      if (isTourSampleId(categoryId)) {
        setDeleteSheetVisible(false);
        return;
      }
      void deleteMutation
        .mutateAsync({ categoryId, reassignToCategoryId })
        .then(() => {
          setDeleteSheetVisible(false);
          showToast({
            variant: "success",
            message: "Category deleted",
          });
          navigation.goBack();
        })
        .catch(() => {
          showToast({
            variant: "error",
            message: "Could not delete category",
          });
        });
    },
    [categoryId, deleteMutation, navigation, showToast],
  );

  const onDeletePress = useCallback(() => {
    if (!category || category.is_system) {
      return;
    }
    void triggerHaptic();
    setDeleteSheetVisible(true);
  }, [category]);

  const handleClear = useCallback(() => {
    void triggerHaptic();
    Keyboard.dismiss();
    setEdits({ categoryId, fields: {} });
  }, [categoryId]);

  const onNameChange = useCallback(
    (value: string) => setField("name", value),
    [setField],
  );
  const onIconChange = useCallback(
    (value: CustomCategoryIconName) => setField("iconName", value),
    [setField],
  );
  const onColorChange = useCallback(
    (value: string) => setField("color", value),
    [setField],
  );
  const onMonthlyBudgetChange = useCallback(
    (value: string) => setField("monthlyBudget", value),
    [setField],
  );
  const onCloseDeleteSheet = useCallback(
    () => setDeleteSheetVisible(false),
    [],
  );

  return {
    category,
    categories,
    name: draft.name,
    iconName: draft.iconName,
    color: draft.color,
    monthlyBudget: draft.monthlyBudget,
    fieldsDisabled,
    saveLoading: updateMutation.isPending,
    deleteLoading: deleteMutation.isPending,
    deleteSheetVisible,
    onNameChange,
    onIconChange,
    onColorChange,
    onMonthlyBudgetChange,
    onClear: handleClear,
    onSave: onSavePress,
    onDeletePress,
    onConfirmDelete: handleConfirmDelete,
    onCloseDeleteSheet,
  };
}
