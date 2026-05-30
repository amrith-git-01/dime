import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui/Button/Button";
import { TextField } from "@/components/ui/TextField/TextField";
import { colors, radius, spacing, typography } from "@/constants/theme";
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
  onSave,
}: CustomCategoryEditorProps) {
  return (
    <View style={styles.card}>
      <CustomCategoryPreviewTile
        name={name}
        iconName={iconName}
        color={color}
      />

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

      <View style={styles.actionsRow}>
        <Button
          title="Save"
          loading={saveLoading}
          disabled={saveDisabled || atLimit}
          onPress={onSave}
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.barBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    gap: spacing.lg,
  },
  limitHint: {
    fontFamily: typography.screenSubtitle.fontFamily,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
    textAlign: "center",
  },
  actionsRow: {},
});
