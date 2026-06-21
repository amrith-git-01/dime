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
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* PREVIEW card */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>PREVIEW</Text>
        <View style={styles.card}>
          <CustomCategoryPreviewTile
            name={name}
            iconName={iconName}
            color={color}
          />
        </View>
      </View>

      {/* NAME field */}
      <View style={styles.section}>
        <View style={styles.card}>
          <TextField
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
      </View>

      {/* ICON + COLOR pickers */}
      {!fieldsDisabled ? (
        <View style={styles.section}>
          <View style={styles.card}>
            <CustomCategoryChipPickers
              selectedIcon={iconName}
              selectedColor={color}
              onSelectIcon={onIconChange}
              onSelectColor={onColorChange}
            />
          </View>
        </View>
      ) : null}

      {/* MONTHLY CAP */}
      {showBudgetSection ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>MONTHLY CAP (OPTIONAL)</Text>
          <View style={styles.card}>
            <CategoryBudgetSection
              value={monthlyBudget}
              onChangeText={onMonthlyBudgetChange}
            />
          </View>
        </View>
      ) : null}

      {limitHint ? <Text style={styles.limitHint}>{limitHint}</Text> : null}

      {/* Footer */}
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
            (saveDisabled || atLimit || saveLoading) && styles.saveBtnDisabled,
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

      {/* Delete link */}
      {onDelete ? (
        <Pressable
          onPress={onDelete}
          disabled={deleteLoading}
          style={({ pressed }) => [
            styles.deleteBtn,
            pressed && styles.deleteBtnPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Delete category"
        >
          <Text style={styles.deleteBtnText}>
            {deleteLoading ? "Deleting…" : "Delete category"}
          </Text>
        </Pressable>
      ) : null}
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
    gap: spacing.md,
  },
  section: {
    gap: spacing.xs,
  },
  sectionLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    lineHeight: 14,
    color: inkSoft,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    paddingHorizontal: spacing.xs,
  },
  card: {
    backgroundColor: surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadows.card,
  },
  limitHint: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: inkSoft,
    textAlign: "center",
  },
  footer: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.sm,
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
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  deleteBtnPressed: {
    opacity: 0.7,
  },
  deleteBtnText: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    lineHeight: 20,
    color: danger,
  },
});
