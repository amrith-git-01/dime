import type { RouteProp } from "@react-navigation/native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button/Button";
import { TextField } from "@/components/ui/TextField/TextField";
import { fontFamilies } from "@/constants/fonts";
import { formStyles } from "@/constants/formStyles";
import { colors, spacing } from "@/constants/theme";
import { CategoryLucideIcon } from "@/features/categories/components/CategoryLucideIcon";
import {
  CUSTOM_CATEGORY_COLOR_OPTIONS,
  CUSTOM_CATEGORY_ICON_OPTIONS,
  DEFAULT_CUSTOM_CATEGORY_COLOR,
  DEFAULT_CUSTOM_CATEGORY_ICON,
  type CustomCategoryIconName,
} from "@/features/categories/constants/customCategoryPresets";
import { MAX_CUSTOM_CATEGORIES } from "@/features/categories/constants/limits";
import { useCreateCategoryMutation } from "@/features/categories/hooks/useCreateCategoryMutation";
import { useLocalCategories } from "@/features/categories/hooks/useLocalCategories";
import { useToast } from "@/features/toast/useToast";
import { hexToRgba } from "@/features/transactions/components/transactionListShared";
import { triggerLightHaptic } from "@/lib/haptics/nativeHaptics";
import type { MainStackParamList } from "@/navigation/types";

type CreateRoute = RouteProp<MainStackParamList, "CreateCustomCategory">;
type StackNav = NativeStackNavigationProp<MainStackParamList>;

export default function CreateCustomCategoryScreen() {
  const navigation = useNavigation<StackNav>();
  const route = useRoute<CreateRoute>();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const createMutation = useCreateCategoryMutation();
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
    name,
    navigation,
    route.params?.origin,
    showToast,
  ]);

  return (
    <KeyboardAwareScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.scrollContent,
        { paddingBottom: spacing.xl + insets.bottom },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.lead}>Pick a name, icon, and color.</Text>

      <View style={styles.body}>
        <View style={styles.previewBlock}>
          <View
            style={[
              styles.previewTile,
              { backgroundColor: hexToRgba(color, 0.1) },
            ]}
          >
            <CategoryLucideIcon
              iconName={iconName}
              color={color}
              size={24}
              strokeWidth={1.5}
            />
          </View>
          <Text style={styles.previewName} numberOfLines={1}>
            {name.trim().length > 0 ? name.trim() : "Category name"}
          </Text>
        </View>

        <View style={styles.formBlock}>
          <TextField
            label="Name"
            placeholder="e.g. Pet care"
            value={name}
            onChangeText={setName}
            maxLength={40}
          />

          <Text style={styles.sectionLabel}>Icon</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.pickerScroll}
            contentContainerStyle={styles.pickerRow}
          >
            {CUSTOM_CATEGORY_ICON_OPTIONS.map((option) => {
              const selected = option === iconName;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    void triggerLightHaptic();
                    setIconName(option);
                  }}
                  style={[
                    styles.iconOption,
                    {
                      borderColor: selected ? colors.primary : colors.border,
                    },
                    selected && styles.iconOptionSelected,
                  ]}
                >
                  <CategoryLucideIcon
                    iconName={option}
                    color={selected ? colors.primary : colors.textSecondary}
                    size={20}
                  />
                </Pressable>
              );
            })}
          </ScrollView>

          <Text style={styles.sectionLabel}>Color</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.pickerScroll}
            contentContainerStyle={styles.pickerRow}
          >
            {CUSTOM_CATEGORY_COLOR_OPTIONS.map((option) => {
              const selected = option === color;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    void triggerLightHaptic();
                    setColor(option);
                  }}
                  style={[
                    styles.colorOption,
                    { backgroundColor: option },
                    {
                      borderColor: selected ? colors.primary : colors.border,
                    },
                  ]}
                />
              );
            })}
          </ScrollView>
        </View>

        {atLimit ? (
          <Text style={styles.limitHint}>
            You have reached the maximum of {MAX_CUSTOM_CATEGORIES} custom
            categories.
          </Text>
        ) : null}

        <View style={styles.actions}>
          <Button
            title="Save"
            loading={createMutation.isPending}
            disabled={atLimit}
            onPress={() => {
              void triggerLightHaptic();
              void handleSave();
            }}
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
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
  },
  lead: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    paddingTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  body: {
    flexGrow: 1,
    justifyContent: "center",
    width: "100%",
    alignItems: "center",
  },
  previewBlock: {
    alignItems: "center",
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  formBlock: {
    alignSelf: "stretch",
    width: "100%",
  },
  previewTile: {
    width: 56,
    height: 56,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  previewName: {
    fontFamily: fontFamilies.medium,
    fontSize: 16,
    color: colors.textPrimary,
    maxWidth: "100%",
  },
  sectionLabel: {
    ...formStyles.fieldLabel,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  pickerScroll: {
    alignSelf: "stretch",
  },
  pickerRow: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    alignItems: "center",
  },
  iconOption: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: colors.barBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  iconOptionSelected: {
    backgroundColor: "rgba(99, 85, 232, 0.08)",
  },
  colorOption: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
  },
  limitHint: {
    alignSelf: "stretch",
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.lg,
  },
  actions: {
    alignSelf: "stretch",
    width: "100%",
    marginTop: spacing.xl,
  },
});
