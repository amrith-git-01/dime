import type { RouteProp } from "@react-navigation/native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useState } from "react";
import { Alert, Keyboard } from "react-native";

import { useUpsertCategoryBudgetMutation } from "@/features/budgets/hooks/useCategoryBudgetMutations";
import { CustomCategoryEditor } from "@/features/categories/components";
import {
  DEFAULT_CUSTOM_CATEGORY_COLOR,
  DEFAULT_CUSTOM_CATEGORY_ICON,
  type CustomCategoryIconName,
} from "@/features/categories/constants/customCategoryPresets";
import { MAX_CUSTOM_CATEGORIES } from "@/features/categories/constants/limits";
import { useCreateCategoryMutation } from "@/features/categories/hooks/useCreateCategoryMutation";
import { useLocalCategories } from "@/features/categories/hooks/useLocalCategories";
import { parseBudgetAmount } from "@/features/categories/utils/parseBudgetAmount";
import { useToast } from "@/features/toast/useToast";
import { triggerLightHaptic } from "@/lib/haptics/nativeHaptics";
import type { MainStackParamList } from "@/navigation/types";

type CreateRoute = RouteProp<MainStackParamList, "CreateCustomCategory">;
type StackNav = NativeStackNavigationProp<MainStackParamList>;

export default function CreateCustomCategoryScreen() {
  const navigation = useNavigation<StackNav>();
  const route = useRoute<CreateRoute>();
  const { showToast } = useToast();
  const createMutation = useCreateCategoryMutation();
  const upsertBudgetMutation = useUpsertCategoryBudgetMutation();
  const { data: categories } = useLocalCategories();

  const customCount = categories.filter(
    (category) => !category.is_system,
  ).length;
  const atLimit = customCount >= MAX_CUSTOM_CATEGORIES;

  const [name, setName] = useState("");
  const [iconName, setIconName] = useState<CustomCategoryIconName>(
    DEFAULT_CUSTOM_CATEGORY_ICON,
  );
  const [color, setColor] = useState<string>(DEFAULT_CUSTOM_CATEGORY_COLOR);
  const [monthlyBudget, setMonthlyBudget] = useState("");

  const handleSave = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert("Name required", "Enter a category name.");
      return;
    }
    if (atLimit) {
      Alert.alert(
        "Limit reached",
        `You can add up to ${MAX_CUSTOM_CATEGORIES} custom categories.`,
      );
      return;
    }

    try {
      const row = await createMutation.mutateAsync({
        name: trimmed,
        icon_name: iconName,
        color,
      });

      const amount = parseBudgetAmount(monthlyBudget);
      if (amount != null) {
        await upsertBudgetMutation.mutateAsync({
          categoryId: row.id,
          monthlyAmount: amount,
        });
      }

      showToast({ variant: "success", message: "Category created" });

      if (route.params?.origin === "manual-add") {
        navigation.navigate({
          name: "ManualAddTransaction",
          params: {
            createdCategoryId: row.id,
            createdCategoryName: row.name,
          },
          merge: true,
        });
        return;
      }

      navigation.goBack();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not create category.";
      showToast({ variant: "error", message: "Could not create category" });
      Alert.alert("Something went wrong", message);
    }
  }, [
    atLimit,
    color,
    createMutation,
    iconName,
    monthlyBudget,
    name,
    navigation,
    route.params?.origin,
    showToast,
    upsertBudgetMutation,
  ]);

  const onSavePress = useCallback(() => {
    void triggerLightHaptic();
    void handleSave();
  }, [handleSave]);

  const handleClear = useCallback(() => {
    void triggerLightHaptic();
    Keyboard.dismiss();
    setName("");
    setIconName(DEFAULT_CUSTOM_CATEGORY_ICON);
    setColor(DEFAULT_CUSTOM_CATEGORY_COLOR);
    setMonthlyBudget("");
  }, []);

  const limitHint = atLimit
    ? `You have reached the maximum of ${MAX_CUSTOM_CATEGORIES} custom categories.`
    : undefined;

  return (
    <CustomCategoryEditor
      name={name}
      iconName={iconName}
      color={color}
      monthlyBudget={monthlyBudget}
      atLimit={atLimit}
      saveDisabled={false}
      saveLoading={createMutation.isPending || upsertBudgetMutation.isPending}
      limitHint={limitHint}
      onNameChange={setName}
      onIconChange={setIconName}
      onColorChange={setColor}
      onMonthlyBudgetChange={setMonthlyBudget}
      onClear={handleClear}
      onSave={onSavePress}
    />
  );
}
