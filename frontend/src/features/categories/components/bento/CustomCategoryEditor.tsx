import { memo } from "react";
import { Text, View } from "react-native";

import { BentoEditorFooter } from "@/components/bento";
import { Button, TextField } from "@/components/ui";
import { radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { useBudgetQuery } from "@/features/budgets/hooks/useBudget";
import type { CustomCategoryIconName } from "@/features/categories/constants/customCategoryPresets";

import { CategoryBudgetSection } from "../CategoryBudgetSection";
import { CustomCategoryChipPickers } from "./CustomCategoryChipPickers";
import { CustomCategoryPreviewTile } from "./CustomCategoryPreviewTile";
import { createThemedStyles } from "@/theme";

type CustomCategoryEditorProps = {
  name: string;
  iconName: CustomCategoryIconName;
  color: string;
  monthlyBudget: string;
  atLimit: boolean;
  saveDisabled: boolean;
  saveLoading: boolean;
  limitHint?: string;
  fieldsDisabled?: boolean;
  showBudgetSection?: boolean;
  onNameChange: (text: string) => void;
  onIconChange: (icon: CustomCategoryIconName) => void;
  onColorChange: (color: string) => void;
  onMonthlyBudgetChange: (text: string) => void;
  onClear: () => void;
  onSave: () => void;
  onDelete?: () => void;
  deleteLoading?: boolean;
};

export const CustomCategoryEditor = memo(function CustomCategoryEditor({
  name,
  iconName,
  color,
  atLimit,
  saveDisabled,
  saveLoading,
  monthlyBudget,
  limitHint,
  fieldsDisabled = false,
  showBudgetSection = true,
  onNameChange,
  onIconChange,
  onColorChange,
  onMonthlyBudgetChange,
  onClear,
  onSave,
  onDelete,
  deleteLoading = false,
}: CustomCategoryEditorProps) {
  const styles = useStyles();
  const optionalTag = <Text style={styles.optionalHint}>(optional)</Text>;
  const requiredTag = <Text style={styles.requiredHint}>(required)</Text>;

  const { data: budgetResp } = useBudgetQuery();
  const budgetMonthly = budgetResp?.budget?.monthly_budget ?? null;
  const existingBudget = budgetMonthly ? Number.parseFloat(budgetMonthly) : 0;
  const hasMonthlyBudget =
    Number.isFinite(existingBudget) && existingBudget > 0;
  const monthlyBudgetAmount = hasMonthlyBudget ? existingBudget : 0;

  return (
    <View style={styles.content}>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.sectionLabel}>PREVIEW</Text>
        </View>
        <CustomCategoryPreviewTile
          name={name}
          iconName={iconName}
          color={color}
          monthlyBudget={monthlyBudget}
          hasMonthlyBudget={hasMonthlyBudget}
          monthlyBudgetAmount={monthlyBudgetAmount}
          showBudgetSection={showBudgetSection}
        />
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.sectionLabel}>NAME</Text>
          {!fieldsDisabled ? requiredTag : null}
        </View>
        <TextField
          hideLabel
          label="Name"
          placeholder="e.g. Pet care"
          value={name}
          onChangeText={onNameChange}
          onSubmitEditing={onSave}
          maxLength={40}
          autoCapitalize="words"
          editable={!fieldsDisabled}
        />
      </View>

      {!fieldsDisabled ? (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.sectionLabel}>ICON</Text>
            {requiredTag}
          </View>
          <CustomCategoryChipPickers
            section="icon"
            selectedIcon={iconName}
            selectedColor={color}
            onSelectIcon={onIconChange}
            onSelectColor={onColorChange}
          />
          <View style={[styles.cardHeader, styles.cardHeaderSpaced]}>
            <Text style={styles.sectionLabel}>COLOR</Text>
            {requiredTag}
          </View>
          <CustomCategoryChipPickers
            section="color"
            selectedIcon={iconName}
            selectedColor={color}
            onSelectIcon={onIconChange}
            onSelectColor={onColorChange}
          />
        </View>
      ) : null}

      {showBudgetSection ? (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.sectionLabel}>MONTHLY CAP</Text>
            {optionalTag}
          </View>
          <CategoryBudgetSection
            value={monthlyBudget}
            onChangeText={onMonthlyBudgetChange}
          />
        </View>
      ) : null}

      {limitHint ? <Text style={styles.limitHint}>{limitHint}</Text> : null}

      <View style={styles.actions}>
        {onDelete ? (
          <Button
            title="Delete category"
            busyLabel="Deleting"
            variant="danger"
            onPress={onDelete}
            loading={deleteLoading}
            accessibilityLabel="Delete category"
          />
        ) : null}

        <BentoEditorFooter
          onClear={onClear}
          onSave={onSave}
          saveLoading={saveLoading}
          saveDisabled={saveDisabled || atLimit}
          clearDisabled={atLimit}
        />
      </View>
    </View>
  );
});

const useStyles = createThemedStyles(({ colors, shadows }) => ({
  content: {
    gap: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    ...shadows.card,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  cardHeaderSpaced: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    letterSpacing: 0.6,
    color: colors.accentText,
    textTransform: "uppercase",
  },
  optionalHint: {
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    color: colors.inkFaint,
  },
  requiredHint: {
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    color: colors.inkSoft,
  },
  limitHint: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
    textAlign: "center",
  },
  actions: {
    gap: spacing.lg,
    marginTop: spacing.sm,
  },
}));
