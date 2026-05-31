import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { BentoEditorFooter } from "@/components/bento/BentoEditorFooter";
import {
  BENTO_FORM_BODY_GAP,
  BENTO_FORM_SECTION_PADDING,
} from "@/components/bento/bentoFormTokens";
import { TwoToneCard } from "@/components/shared/TwoToneCard";
import { TextField } from "@/components/ui/TextField/TextField";
import { typography } from "@/constants/theme";
import type { CustomCategoryIconName } from "@/features/categories/constants/customCategoryPresets";

import { CustomCategoryChipPickers } from "./CustomCategoryChipPickers";
import { CustomCategoryPreviewTile } from "./CustomCategoryPreviewTile";

type CustomCategoryEditorProps = {
  name: string;
  iconName: CustomCategoryIconName;
  color: string;
  atLimit: boolean;
  saveDisabled: boolean;
  saveLoading: boolean;
  limitHint?: string;
  onNameChange: (text: string) => void;
  onIconChange: (icon: CustomCategoryIconName) => void;
  onColorChange: (color: string) => void;
  onClear: () => void;
  onSave: () => void;
};

export const CustomCategoryEditor = memo(function CustomCategoryEditor({
  name,
  iconName,
  color,
  atLimit,
  saveDisabled,
  saveLoading,
  limitHint,
  onNameChange,
  onIconChange,
  onColorChange,
  onClear,
  onSave,
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
          />

          <CustomCategoryChipPickers
            selectedIcon={iconName}
            selectedColor={color}
            onSelectIcon={onIconChange}
            onSelectColor={onColorChange}
          />

          {limitHint ? <Text style={styles.limitHint}>{limitHint}</Text> : null}

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
