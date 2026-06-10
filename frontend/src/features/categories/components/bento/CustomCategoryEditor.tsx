import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  BENTO_FORM_BODY_GAP,
  BENTO_FORM_SECTION_PADDING,
  BentoEditorFooter,
} from "@/components/bento";
import { TwoToneCard } from "@/components/shared";
import { Button, TextField } from "@/components/ui";
import { typography } from "@/constants";
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
    <TwoToneCard
      header={
        <View style={styles.headerInner}>
          <CustomCategoryPreviewTile
            name={name}
            iconName={iconName}
            color={color}
          />
        </View>
      }
      body={
        <View style={styles.bodyInner}>
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

          {!fieldsDisabled ? (
            <CustomCategoryChipPickers
              selectedIcon={iconName}
              selectedColor={color}
              onSelectIcon={onIconChange}
              onSelectColor={onColorChange}
            />
          ) : null}

          {showBudgetSection ? (
            <CategoryBudgetSection
              value={monthlyBudget}
              onChangeText={onMonthlyBudgetChange}
            />
          ) : null}

          {limitHint ? <Text style={styles.limitHint}>{limitHint}</Text> : null}

          {onDelete ? (
            <Button
              variant="danger"
              title="Delete category"
              onPress={onDelete}
              loading={deleteLoading}
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
      }
    />
  );
});

const styles = StyleSheet.create({
  headerInner: {
    paddingHorizontal: BENTO_FORM_SECTION_PADDING,
    paddingTop: BENTO_FORM_SECTION_PADDING,
    paddingBottom: BENTO_FORM_SECTION_PADDING,
  },
  bodyInner: {
    paddingHorizontal: BENTO_FORM_SECTION_PADDING,
    paddingTop: BENTO_FORM_SECTION_PADDING,
    paddingBottom: BENTO_FORM_SECTION_PADDING,
    gap: BENTO_FORM_BODY_GAP,
  },
  limitHint: {
    fontFamily: typography.screenSubtitle.fontFamily,
    fontSize: 13,
    lineHeight: 18,
    color: typography.screenSubtitle.color,
    textAlign: "center",
  },
});
