import { memo } from "react";
import { Text, View } from "react-native";

import { CategoryPill } from "@/components/categories/CategoryPill";
import { ConfirmModal } from "@/components/shared";
import {
  Button,
  SelectDropdown,
  SlidingSegmentedControl,
  type SlidingSegmentedOption,
  TextField,
} from "@/components/ui";
import { fontFamilies, radius, spacing } from "@/constants";
import { tourTargetIds } from "@/constants/tourTargetIds";
import { useTourTarget } from "@/hooks/useTourTarget";
import { SettingsToggleRow } from "@/features/settings/components";
import { LeadDayChips } from "@/features/reminders/components";
import { RECURRING_LEAD_DAY_OPTIONS } from "@/features/reminders/constants";
import { ManualAddAmountSection } from "@/features/transactions/components/bento";

import { useRecurringSheetModel } from "../hooks/useRecurringSheetModel";
import type { RecurringCadence, RecurringItem, RecurringKind } from "../types";
import { postCurrentPeriodLabel } from "../utils/recurringDisplay";
import { MONTH_NAMES } from "../utils/recurringForm";
import { createThemedStyles } from "@/theme";

export type RecurringEditorProps = {
  /** Kind chosen by the card that opened the page. */
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

const CADENCE_OPTIONS: readonly SlidingSegmentedOption<RecurringCadence>[] = [
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

// The amount section only uses the type to colour the amount; its switch is hidden here.
const noop = () => undefined;

/** Add / edit form of a recurring income or subscription (the RecurringEditor page). */
export const RecurringEditor = memo(function RecurringEditor({
  kind: initialKind,
  item,
  onDone,
}: RecurringEditorProps) {
  const styles = useStyles();
  const formTourTarget = useTourTarget(tourTargetIds.recurringEditorForm);
  const model = useRecurringSheetModel({ kind: initialKind, item, onClose: onDone });
  const { form, errors, update, copy, isEditing, kind } = model;
  const isYearly = form.cadence === "yearly";
  const showStatusCard = isEditing || model.showPostCurrentPeriod;

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

      <View {...formTourTarget} style={[styles.amountCard, styles.cardShadow]}>
        <ManualAddAmountSection
          amountText={form.amountText}
          amountFocused={false}
          onAmountChange={(amountText) => update({ amountText })}
          onAmountFocus={noop}
          onAmountBlur={noop}
          txType={kind === "income" ? "credit" : "debit"}
          onSetExpense={noop}
          onSetIncome={noop}
          showTypeToggle={false}
          errorMessage={errors.amount ?? null}
        />
      </View>

      <View style={[styles.card, styles.cardShadow]}>
        <View style={styles.cardHeader}>
          <Text style={styles.sectionLabel}>NAME</Text>
          <Text style={styles.requiredHint}>(required)</Text>
        </View>
        <TextField
          label="Name"
          hideLabel
          placeholder={copy.namePlaceholder}
          value={form.name}
          onChangeText={(name) => update({ name })}
          maxLength={80}
          autoCapitalize="words"
          errorMessage={errors.name ?? null}
        />
      </View>

      <View style={[styles.card, styles.cardShadow]}>
        <View style={styles.cardHeader}>
          <Text style={styles.sectionLabel}>REPEATS</Text>
          <Text style={styles.requiredHint}>(required)</Text>
        </View>
        <View style={styles.cardBody}>
          <SlidingSegmentedControl
            options={CADENCE_OPTIONS}
            value={form.cadence}
            onChange={(cadence) => update({ cadence })}
          />

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
        </View>
      </View>

      <View style={[styles.card, styles.cardShadow]}>
        <View style={styles.cardHeader}>
          <Text style={styles.sectionLabel}>CATEGORY</Text>
          <Text style={styles.requiredHint}>(required)</Text>
        </View>
        <View style={styles.categoryGrid}>
          {model.categoriesLoading ? (
            <Text style={styles.hint}>Loading categories</Text>
          ) : (
            model.pickerCategories.map((category) => (
              <CategoryPill
                key={category.id}
                label={category.name}
                iconName={category.icon_name}
                iconColor={category.color}
                selected={form.categoryId === category.id}
                onPress={() => model.onCategoryPress(category)}
              />
            ))
          )}
        </View>
        {errors.category ? (
          <Text style={styles.errorText}>{errors.category}</Text>
        ) : null}
      </View>

      <View style={[styles.card, styles.cardShadow]}>
        <View style={styles.cardHeader}>
          <Text style={styles.sectionLabel}>REMIND ME</Text>
          <Text style={styles.requiredHint}>(optional)</Text>
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.hint}>
            Days before it is due. Pick none for no reminder.
          </Text>
          <LeadDayChips
            options={RECURRING_LEAD_DAY_OPTIONS}
            selected={form.remindLeadDays}
            onToggle={model.onRemindLeadDayToggle}
          />
        </View>
      </View>

      {showStatusCard ? (
        <View style={[styles.card, styles.cardShadow]}>
          <View style={styles.cardHeader}>
            <Text style={styles.sectionLabel}>
              {isEditing ? "STATUS" : "THIS PERIOD"}
            </Text>
          </View>
          {isEditing ? (
            <SettingsToggleRow
              label={form.active ? "Active" : "Paused"}
              subtitle={copy.activeSubtitle}
              value={form.active}
              onValueChange={(active) => update({ active })}
            />
          ) : (
            <SettingsToggleRow
              label={postCurrentPeriodLabel(kind, form.cadence)}
              subtitle="Adds this period's transaction right away so your totals are right."
              value={form.postCurrentPeriod}
              onValueChange={(postCurrentPeriod) =>
                update({ postCurrentPeriod })
              }
            />
          )}
        </View>
      ) : null}

      {isEditing ? (
        <View style={styles.actionsRow}>
          <View style={styles.actionSlot}>
            <Button
              title="Delete"
              busyLabel="Deleting"
              variant="danger"
              loading={model.deleting}
              disabled={model.saving}
              onPress={model.onDeletePress}
            />
          </View>
          <View style={styles.actionSlot}>
            <Button
              title="Save"
              busyLabel="Saving"
              loading={model.saving}
              disabled={model.saveDisabled || model.deleting}
              onPress={model.onSave}
            />
          </View>
        </View>
      ) : (
        <Button
          title="Add"
          busyLabel="Adding"
          loading={model.saving}
          onPress={model.onSave}
        />
      )}
    </View>
  );
});

const useStyles = createThemedStyles(({ colors, shadows }) => ({
  cardShadow: shadows.card,
  content: {
    gap: spacing.lg,
  },
  amountCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  cardBody: {
    gap: spacing.md,
  },
  sectionLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    letterSpacing: 0.6,
    color: colors.accentText,
    textTransform: "uppercase",
  },
  errorText: {
    marginTop: spacing.sm,
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.danger,
  },
  requiredHint: {
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    color: colors.inkSoft,
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
    color: colors.inkSoft,
  },
  actionsRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  actionSlot: {
    flex: 1,
  },
}));
