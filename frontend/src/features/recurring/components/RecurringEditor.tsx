import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { CategoryPill } from "@/components/categories/CategoryPill";
import { ConfirmModal } from "@/components/shared";
import {
  Button,
  SegmentChip,
  SelectDropdown,
  TextField,
} from "@/components/ui";
import { fontFamilies, inkSoft, spacing } from "@/constants";
import { formStyles } from "@/constants/formStyles";
import { SettingsToggleRow } from "@/features/settings/components";

import { useRecurringSheetModel } from "../hooks/useRecurringSheetModel";
import type { RecurringItem, RecurringKind } from "../types";
import { postCurrentPeriodLabel } from "../utils/recurringDisplay";
import { MONTH_NAMES } from "../utils/recurringForm";

export type RecurringEditorProps = {
  /** Kind preselected by the card that opened the page. */
  kind: RecurringKind;
  /** Item to edit; omit to add a new one. */
  item?: RecurringItem;
  /** Called after a save or delete (the screen goes back). */
  onDone: () => void;
};

const MONTH_OPTIONS = MONTH_NAMES.map((label, index) => ({
  value: String(index + 1),
  label,
}));

/** Add / edit form of a recurring income or subscription (the RecurringEditor page). */
export const RecurringEditor = memo(function RecurringEditor({
  kind: initialKind,
  item,
  onDone,
}: RecurringEditorProps) {
  const model = useRecurringSheetModel({ kind: initialKind, item, onClose: onDone });
  const { form, errors, update, copy, isEditing, kind } = model;
  const isYearly = form.cadence === "yearly";

  return (
    <View style={styles.content}>
      <ConfirmModal
        visible={model.deleteVisible}
        title={copy.deleteTitle}
        message={copy.deleteMessage}
        confirmLabel="Delete"
        confirmBusyLabel="Deleting"
        confirmTone="danger"
        confirmLoading={model.deleting}
        onCancel={model.onDeleteCancel}
        onConfirm={model.onDeleteConfirm}
      />
      {!isEditing ? (
        <View>
          <Text style={formStyles.fieldLabel}>Type</Text>
          <View style={styles.chipRow}>
            <SegmentChip
              label="Income"
              selected={kind === "income"}
              onPress={() => model.onKindChange("income")}
            />
            <SegmentChip
              label="Subscription"
              selected={kind === "subscription"}
              onPress={() => model.onKindChange("subscription")}
            />
          </View>
        </View>
      ) : null}

      <TextField
        label="Name"
        placeholder={copy.namePlaceholder}
        value={form.name}
        onChangeText={(name) => update({ name })}
        maxLength={80}
        autoCapitalize="words"
        errorMessage={errors.name ?? null}
      />

      <TextField
        label="Amount"
        placeholder="0.00"
        value={form.amountText}
        onChangeText={(amountText) => update({ amountText })}
        keyboardType="decimal-pad"
        showClear={false}
        errorMessage={errors.amount ?? null}
      />

      <View>
        <Text style={formStyles.fieldLabel}>Repeats</Text>
        <View style={styles.chipRow}>
          <SegmentChip
            label="Monthly"
            selected={!isYearly}
            onPress={() => update({ cadence: "monthly" })}
          />
          <SegmentChip
            label="Yearly"
            selected={isYearly}
            onPress={() => update({ cadence: "yearly" })}
          />
        </View>
      </View>

      {isYearly ? (
        <SelectDropdown
          label="Month"
          options={MONTH_OPTIONS}
          value={String(form.monthOfYear)}
          onChange={(value) => update({ monthOfYear: Number(value) })}
          maxVisibleOptions={6}
          errorMessage={errors.month ?? null}
        />
      ) : null}

      <View>
        <TextField
          label="Day of month"
          placeholder="1 to 31"
          value={form.dayOfMonthText}
          onChangeText={(dayOfMonthText) => update({ dayOfMonthText })}
          keyboardType="number-pad"
          maxLength={2}
          showClear={false}
          errorMessage={errors.day ?? null}
        />
        <Text style={styles.hint}>
          In months with fewer days, it falls on the last day of the month.
        </Text>
      </View>

      {kind === "subscription" ? (
        <View>
          <Text style={formStyles.fieldLabel}>Category</Text>
          <View style={styles.categoryGrid}>
            {model.categoriesLoading ? (
              <Text style={styles.hint}>Loading categories</Text>
            ) : (
              model.pickerCategories.map((category) => {
                const selected = form.categoryId === category.id;
                return (
                  <CategoryPill
                    key={category.id}
                    label={category.name}
                    iconName={category.icon_name}
                    iconColor={category.color}
                    selected={selected}
                    onPress={() => model.onCategoryPress(category, selected)}
                  />
                );
              })
            )}
          </View>
        </View>
      ) : null}

      {isEditing ? (
        <SettingsToggleRow
          label={form.active ? "Active" : "Paused"}
          subtitle={copy.activeSubtitle}
          value={form.active}
          onValueChange={(active) => update({ active })}
        />
      ) : null}

      {model.showPostCurrentPeriod ? (
        <SettingsToggleRow
          label={postCurrentPeriodLabel(kind, form.cadence)}
          subtitle="Adds this period's transaction right away so your totals are right."
          value={form.postCurrentPeriod}
          onValueChange={(postCurrentPeriod) => update({ postCurrentPeriod })}
        />
      ) : null}

      <Button
        title={isEditing ? "Save" : "Add"}
        busyLabel={isEditing ? "Saving" : "Adding"}
        loading={model.saving}
        disabled={model.saveDisabled || model.deleting}
        onPress={model.onSave}
      />

      {isEditing ? (
        <Button
          title="Delete"
          busyLabel="Deleting"
          variant="ghostDanger"
          loading={model.deleting}
          disabled={model.saving}
          onPress={model.onDeletePress}
        />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
  },
  chipRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  hint: {
    marginTop: spacing.xs,
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: inkSoft,
  },
});
