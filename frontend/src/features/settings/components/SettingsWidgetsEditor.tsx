import { memo } from "react";
import { Text, View } from "react-native";

import { Button, TextField } from "@/components/ui";
import { fontFamilies, spacing } from "@/constants";
import type { CategoryRow } from "@/features/categories/types";
import { ManualAddCategorySection } from "@/features/transactions/components/bento/ManualAddCategorySection";
import { MAX_WIDGET_PRESET_LABEL_LENGTH } from "@/lib/widgets/widgetPresetsMmkv";
import { createThemedStyles } from "@/theme";

import { SettingsFormCard } from "./SettingsFormCard";
import { SettingsToggleRow } from "./SettingsToggleRow";

export type WidgetPresetListItem = {
  /** "Chai · ₹20". */
  title: string;
  /** The category's name. */
  subtitle: string;
};

export type WidgetPresetForm = {
  title: string;
  label: string;
  amountText: string;
  categoryId: string | null;
  saveDisabled: boolean;
};

export type SettingsWidgetsEditorProps = {
  hideAmounts: boolean;
  onHideAmountsChange: (hide: boolean) => void;
  presets: WidgetPresetListItem[];
  canAddPreset: boolean;
  onAddPreset: () => void;
  onEditPreset: (index: number) => void;
  onRemovePreset: (index: number) => void;
  /** The preset being added or edited; null while only the list shows. */
  form: WidgetPresetForm | null;
  categories: CategoryRow[];
  categoriesLoading: boolean;
  onLabelChange: (text: string) => void;
  onAmountChange: (text: string) => void;
  onCategoryChange: (categoryId: string) => void;
  onFormSave: () => void;
  onFormCancel: () => void;
};

/** Applies on tap (privacy toggle) or on Save (a preset): both are device-local, no server call. */
export const SettingsWidgetsEditor = memo(function SettingsWidgetsEditor({
  hideAmounts,
  onHideAmountsChange,
  presets,
  canAddPreset,
  onAddPreset,
  onEditPreset,
  onRemovePreset,
  form,
  categories,
  categoriesLoading,
  onLabelChange,
  onAmountChange,
  onCategoryChange,
  onFormSave,
  onFormCancel,
}: SettingsWidgetsEditorProps) {
  const styles = useStyles();

  return (
    <View style={styles.root}>
      <SettingsFormCard title="Privacy">
        <SettingsToggleRow
          label="Hide amounts on widgets"
          subtitle="Show ₹ •••• instead of your amounts on the home screen."
          value={hideAmounts}
          onValueChange={onHideAmountsChange}
        />
      </SettingsFormCard>

      <SettingsFormCard
        title="One-tap presets"
        subtitle="Up to 3 buttons on the Quick add widget (make it 4×2 to see them). One tap adds the expense without opening Dime."
      >
        {presets.map((preset, index) => (
          <View key={`${preset.title}-${index}`} style={styles.presetRow}>
            <View style={styles.presetText}>
              <Text style={styles.presetTitle} numberOfLines={1}>
                {preset.title}
              </Text>
              <Text style={styles.presetSubtitle} numberOfLines={1}>
                {preset.subtitle}
              </Text>
            </View>
            <Button
              title="Edit"
              variant="ghost"
              size="compact"
              disabled={form !== null}
              onPress={() => onEditPreset(index)}
              accessibilityLabel={`Edit ${preset.title}`}
            />
            <Button
              title="Remove"
              variant="ghost"
              size="compact"
              disabled={form !== null}
              onPress={() => onRemovePreset(index)}
              accessibilityLabel={`Remove ${preset.title}`}
            />
          </View>
        ))}

        {form ? (
          <View style={styles.form}>
            <Text style={styles.formTitle}>{form.title}</Text>
            <TextField
              label="Name"
              placeholder="e.g. Chai"
              value={form.label}
              onChangeText={onLabelChange}
              maxLength={MAX_WIDGET_PRESET_LABEL_LENGTH}
              autoCapitalize="sentences"
            />
            <TextField
              label="Amount (₹)"
              placeholder="20"
              value={form.amountText}
              onChangeText={onAmountChange}
              keyboardType="decimal-pad"
              maxLength={10}
            />
            <View style={styles.categoryBlock}>
              <Text style={styles.categoryLabel}>Category</Text>
              <ManualAddCategorySection
                categoriesLoading={categoriesLoading}
                visibleCategories={categories}
                categoryId={form.categoryId}
                onCategoryPress={(category) => onCategoryChange(category.id)}
              />
            </View>
            <View style={styles.formActions}>
              <View style={styles.formAction}>
                <Button title="Cancel" variant="secondary" onPress={onFormCancel} />
              </View>
              <View style={styles.formAction}>
                <Button
                  title="Save"
                  disabled={form.saveDisabled}
                  onPress={onFormSave}
                />
              </View>
            </View>
          </View>
        ) : canAddPreset ? (
          <Button title="Add preset" variant="secondary" onPress={onAddPreset} />
        ) : null}
      </SettingsFormCard>

      <Text style={styles.hint}>
        On Xiaomi or MIUI phones, allow Autostart for Dime (Settings, Apps,
        Permissions, Autostart) so widget taps work while the app is closed.
      </Text>
    </View>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  root: {
    gap: spacing.lg,
  },
  presetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  presetText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  presetTitle: {
    fontFamily: fontFamilies.medium,
    fontSize: 15,
    lineHeight: 22,
    color: colors.ink,
  },
  presetSubtitle: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkSoft,
  },
  form: {
    gap: spacing.lg,
  },
  formTitle: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    lineHeight: 22,
    color: colors.ink,
  },
  categoryBlock: {
    gap: spacing.sm,
  },
  categoryLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
  },
  formActions: {
    flexDirection: "row",
    gap: spacing.md,
  },
  formAction: {
    flex: 1,
  },
  hint: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
  },
}));
