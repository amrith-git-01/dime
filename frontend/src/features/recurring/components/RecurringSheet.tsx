import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { CategoryPill } from "@/components/categories/CategoryPill";
import { BottomSheet, ConfirmModal } from "@/components/shared";
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

export type RecurringSheetProps = {
  visible: boolean;
  /** Kind preselected by the card that opened the sheet. */
  kind: RecurringKind;
  /** Item to edit; omit to add a new one. */
  item?: RecurringItem;
  onClose: () => void;
};

const MONTH_OPTIONS = MONTH_NAMES.map((label, index) => ({
  value: String(index + 1),
  label,
}));

/** Add / edit a recurring income or subscription in a bottom sheet. */
export const RecurringSheet = memo(function RecurringSheet({
  visible,
  kind,
  item,
  onClose,
}: RecurringSheetProps) {
  // The body mounts per open, so every open starts from a fresh form.
  if (!visible) {
    return null;
  }
  return <RecurringSheetBody kind={kind} item={item} onClose={onClose} />;
});

type BodyProps = Omit<RecurringSheetProps, "visible">;

function RecurringSheetBody({ kind: initialKind, item, onClose }: BodyProps) {
  const model = useRecurringSheetModel({ kind: initialKind, item, onClose });
  const { form, errors, update, copy, isEditing, kind } = model;
  const isYearly = form.cadence === "yearly";

  return (
    <BottomSheet
      visible
      title={isEditing ? copy.editTitle : copy.addTitle}
      onClose={onClose}
      dismissDisabled={model.busy}
      overlay={
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
      }
    >
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
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
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
