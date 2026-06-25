import { memo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { TextField } from "@/components/ui";
import {
  accent,
  danger,
  ink,
  inkFaint,
  inkSoft,
  line,
  paper,
  radius,
  shadows,
  spacing,
  surface,
} from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { useBudgetQuery } from "@/features/budgets/hooks/useBudget";
import type { CustomCategoryIconName } from "@/features/categories/constants/customCategoryPresets";

import { CategoryBudgetSection } from "../CategoryBudgetSection";
import { CustomCategoryChipPickers } from "./CustomCategoryChipPickers";
import { CustomCategoryPreviewTile } from "./CustomCategoryPreviewTile";

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
  const optionalTag = <Text style={styles.optionalHint}>(optional)</Text>;
  const requiredTag = <Text style={styles.requiredHint}>(required)</Text>;

  const { data: budgetResp } = useBudgetQuery();
  const budgetMonthly = budgetResp?.budget?.monthly_budget ?? null;
  const existingBudget = budgetMonthly ? Number.parseFloat(budgetMonthly) : 0;
  const hasMonthlyBudget =
    Number.isFinite(existingBudget) && existingBudget > 0;
  const monthlyBudgetAmount = hasMonthlyBudget ? existingBudget : 0;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
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
          <Pressable
            onPress={onDelete}
            disabled={deleteLoading}
            style={({ pressed }) => [
              styles.deleteBtn,
              deleteLoading && styles.deleteBtnDisabled,
              pressed && !deleteLoading && styles.deleteBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Delete category"
          >
            <Text style={styles.deleteBtnText}>
              {deleteLoading ? "Deleting…" : "Delete category"}
            </Text>
          </Pressable>
        ) : null}

        <View style={styles.footer}>
          <Pressable
            onPress={onClear}
            disabled={atLimit}
            style={({ pressed }) => [
              styles.clearBtn,
              atLimit && styles.clearBtnDisabled,
              pressed && !atLimit && styles.clearBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Clear"
          >
            <Text
              style={[
                styles.clearBtnText,
                atLimit && styles.clearBtnTextDisabled,
              ]}
            >
              Clear
            </Text>
          </Pressable>
          <Pressable
            onPress={onSave}
            disabled={saveDisabled || atLimit || saveLoading}
            style={({ pressed }) => [
              styles.saveBtn,
              (saveDisabled || atLimit || saveLoading) &&
                styles.saveBtnDisabled,
              pressed &&
                !(saveDisabled || atLimit || saveLoading) &&
                styles.saveBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Save"
          >
            <Text style={styles.saveBtnText}>
              {saveLoading ? "Saving…" : "Save"}
            </Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: paper,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl * 3,
    gap: spacing.lg,
  },
  card: {
    backgroundColor: surface,
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
    color: accent,
    textTransform: "uppercase",
  },
  optionalHint: {
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    color: inkFaint,
  },
  requiredHint: {
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    color: inkSoft,
  },
  limitHint: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: inkSoft,
    textAlign: "center",
  },
  actions: {
    gap: spacing.lg,
    marginTop: spacing.sm,
  },
  footer: {
    flexDirection: "row",
    gap: spacing.md,
  },
  clearBtn: {
    flex: 1,
    borderRadius: radius.full,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: line,
  },
  clearBtnDisabled: {
    opacity: 0.4,
  },
  clearBtnPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  clearBtnText: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    lineHeight: 20,
    color: ink,
  },
  clearBtnTextDisabled: {
    color: inkFaint,
  },
  saveBtn: {
    flex: 2,
    borderRadius: radius.full,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: accent,
  },
  saveBtnDisabled: {
    opacity: 0.45,
  },
  saveBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  saveBtnText: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    lineHeight: 20,
    color: surface,
  },
  deleteBtn: {
    borderRadius: radius.full,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: danger,
  },
  deleteBtnDisabled: {
    opacity: 0.45,
  },
  deleteBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  deleteBtnText: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    lineHeight: 20,
    color: surface,
  },
});
