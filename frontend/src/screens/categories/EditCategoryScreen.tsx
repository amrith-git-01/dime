import type { RouteProp } from "@react-navigation/native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Keyboard } from "react-native";

import {
  useDeleteCategoryBudgetMutation,
  useUpsertCategoryBudgetMutation,
} from "@/features/budgets/hooks/useCategoryBudgetMutations";
import { useCategoryBudgetsQuery } from "@/features/budgets/hooks/useCategoryBudgetsQuery";
import { CustomCategoryEditor } from "@/features/categories/components";
import {
  DEFAULT_CUSTOM_CATEGORY_COLOR,
  DEFAULT_CUSTOM_CATEGORY_ICON,
  type CustomCategoryIconName,
} from "@/features/categories/constants/customCategoryPresets";
import {
  useDeleteCategoryMutation,
  useUpdateCategoryMutation,
} from "@/features/categories/hooks/useCategoryMutations";
import { useLocalCategories } from "@/features/categories/hooks/useLocalCategories";
import { parseBudgetAmount } from "@/features/categories/utils/parseBudgetAmount";
import { useToast } from "@/features/toast/useToast";
import { triggerLightHaptic } from "@/lib/haptics/nativeHaptics";
import type { MainStackParamList } from "@/navigation/types";

type EditRoute = RouteProp<MainStackParamList, "EditCategory">;
type StackNav = NativeStackNavigationProp<MainStackParamList>;

export default function EditCategoryScreen() {
  const navigation = useNavigation<StackNav>();
  const route = useRoute<EditRoute>();
  const { showToast } = useToast();
  const categoryId = route.params.categoryId;

  const { data: categories } = useLocalCategories();
  const { data: categoryBudgets = [] } = useCategoryBudgetsQuery();
  const updateMutation = useUpdateCategoryMutation();
  const deleteMutation = useDeleteCategoryMutation();
  const upsertBudgetMutation = useUpsertCategoryBudgetMutation();
  const deleteBudgetMutation = useDeleteCategoryBudgetMutation();

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

  const [name, setName] = useState(category?.name ?? "");
  const [iconName, setIconName] = useState<CustomCategoryIconName>(
    (category?.icon_name as CustomCategoryIconName) ??
      DEFAULT_CUSTOM_CATEGORY_ICON,
  );
  const [color, setColor] = useState(
    category?.color ?? DEFAULT_CUSTOM_CATEGORY_COLOR,
  );
  const [monthlyBudget, setMonthlyBudget] = useState(initialBudget);

  const fieldsDisabled = category?.is_system ?? false;

  useEffect(() => {
    if (!category) {
      return;
    }
    setName(category.name);
    setIconName(
      (category.icon_name as CustomCategoryIconName) ??
        DEFAULT_CUSTOM_CATEGORY_ICON,
    );
    setColor(category.color);
  }, [category]);

  useEffect(() => {
    setMonthlyBudget(initialBudget);
  }, [initialBudget]);

  const handleSave = useCallback(async () => {
    if (!category) {
      Alert.alert("Category not found", "Go back and try again.");
      return;
    }

    const trimmed = name.trim();
    if (!fieldsDisabled && !trimmed) {
      Alert.alert("Name required", "Enter a category name.");
      return;
    }

    try {
      if (!fieldsDisabled) {
        await updateMutation.mutateAsync({
          categoryId,
          payload: {
            name: trimmed,
            icon_name: iconName,
            color,
          },
        });
      }

      const amount = parseBudgetAmount(monthlyBudget);
      if (amount != null) {
        await upsertBudgetMutation.mutateAsync({
          categoryId,
          monthlyAmount: amount,
        });
      } else {
        await deleteBudgetMutation.mutateAsync(categoryId);
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
    color,
    deleteBudgetMutation,
    fieldsDisabled,
    iconName,
    monthlyBudget,
    name,
    navigation,
    showToast,
    updateMutation,
    upsertBudgetMutation,
  ]);

  const onSavePress = useCallback(() => {
    void triggerLightHaptic();
    void handleSave();
  }, [handleSave]);

  const handleDelete = useCallback(() => {
    if (!category || category.is_system) {
      return;
    }
    Alert.alert(
      `Delete ${category.name}?`,
      "Past transactions will become uncategorized. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void deleteMutation
              .mutateAsync(categoryId)
              .then(() => {
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
        },
      ],
    );
  }, [category, categoryId, deleteMutation, navigation, showToast]);

  const onDeletePress = useCallback(() => {
    void triggerLightHaptic();
    handleDelete();
  }, [handleDelete]);

  const handleClear = useCallback(() => {
    void triggerLightHaptic();
    Keyboard.dismiss();
    if (!fieldsDisabled) {
      setName(category?.name ?? "");
      setIconName(
        (category?.icon_name as CustomCategoryIconName) ??
          DEFAULT_CUSTOM_CATEGORY_ICON,
      );
      setColor(category?.color ?? DEFAULT_CUSTOM_CATEGORY_COLOR);
    }
    setMonthlyBudget("");
  }, [category, fieldsDisabled]);

  if (!category) {
    return null;
  }

  return (
    <CustomCategoryEditor
      name={name}
      iconName={iconName}
      color={color}
      monthlyBudget={monthlyBudget}
      atLimit={false}
      saveDisabled={false}
      saveLoading={
        updateMutation.isPending ||
        upsertBudgetMutation.isPending ||
        deleteBudgetMutation.isPending
      }
      fieldsDisabled={fieldsDisabled}
      onDelete={fieldsDisabled ? undefined : onDeletePress}
      deleteLoading={deleteMutation.isPending}
      onNameChange={setName}
      onIconChange={setIconName}
      onColorChange={setColor}
      onMonthlyBudgetChange={setMonthlyBudget}
      onClear={handleClear}
      onSave={onSavePress}
    />
  );
}
