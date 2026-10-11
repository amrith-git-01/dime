import { memo } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import {
  Button,
  SegmentChip,
  SelectDropdown,
  TextField,
} from "@/components/ui";
import {
  danger,
  fontFamilies,
  inkSoft,
  radius,
  shadow,
  spacing,
  surface,
} from "@/constants";
import { formStyles } from "@/constants/formStyles";
import type { CategoryRow } from "@/features/categories/types";
import {
  ManualAddAmountSection,
  ManualAddCategorySection,
} from "@/features/transactions/components";
import {
  SettingsEditorFooter,
  SettingsFormCard,
  SettingsToggleRow,
} from "@/features/settings/components";

import type { RecurringCadence, RecurringKind } from "../types";
import { MONTH_NAMES } from "../utils/recurringForm";
import {
  postCurrentPeriodLabel,
  RECURRING_COPY,
} from "../utils/recurringDisplay";

export type RecurringEditorProps = {
  kind: RecurringKind;
  isEditing: boolean;
  name: string;
  onNameChange: (text: string) => void;
  amountText: string;
  amountFocused: boolean;
  onAmountChange: (text: string) => void;
  onAmountFocus: () => void;
  onAmountBlur: () => void;
  amountError: string | null;
  cadence: RecurringCadence;
  onCadenceChange: (cadence: RecurringCadence) => void;
  monthOfYear: number;
  onMonthChange: (month: number) => void;
  dayOfMonthText: string;
  onDayOfMonthChange: (text: string) => void;
  dayError: string | null;
  categoriesLoading: boolean;
  categories: CategoryRow[];
  categoryId: string | null;
  onCategoryPress: (category: CategoryRow, selected: boolean) => void;
  note: string;
  onNoteChange: (text: string) => void;
  active: boolean;
  onActiveChange: (active: boolean) => void;
  /** Show the "already received / paid this period?" switch (create only, due day has passed). */
  showPostCurrentPeriod: boolean;
  postCurrentPeriod: boolean;
  onPostCurrentPeriodChange: (value: boolean) => void;
  saveLoading: boolean;
  saveDisabled: boolean;
  clearDisabled: boolean;
  onSave: () => void;
  onClear: () => void;
  onDelete?: () => void;
  deleteDisabled?: boolean;
};

const MONTH_OPTIONS = MONTH_NAMES.map((label, index) => ({
  value: String(index + 1),
  label,
}));

const cardShadow = Platform.select({
  android: { elevation: 2 },
  default: {
    shadowColor: shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
});

/** Add / edit form for a recurring income or subscription. */
export const RecurringEditor = memo(function RecurringEditor({
  kind,
  isEditing,
  name,
  onNameChange,
  amountText,
  amountFocused,
  onAmountChange,
  onAmountFocus,
  onAmountBlur,
  amountError,
  cadence,
  onCadenceChange,
  monthOfYear,
  onMonthChange,
  dayOfMonthText,
  onDayOfMonthChange,
  dayError,
  categoriesLoading,
  categories,
  categoryId,
  onCategoryPress,
  note,
  onNoteChange,
  active,
  onActiveChange,
  showPostCurrentPeriod,
  postCurrentPeriod,
  onPostCurrentPeriodChange,
  saveLoading,
  saveDisabled,
  clearDisabled,
  onSave,
  onClear,
  onDelete,
  deleteDisabled = false,
}: RecurringEditorProps) {
  const copy = RECURRING_COPY[kind];
  const isYearly = cadence === "yearly";

  return (
    <View style={styles.root}>
      <View style={[styles.amountCard, cardShadow]}>
        <ManualAddAmountSection
          amountText={amountText}
          amountFocused={amountFocused}
          onAmountChange={onAmountChange}
          onAmountFocus={onAmountFocus}
          onAmountBlur={onAmountBlur}
          txType={kind === "income" ? "credit" : "debit"}
          onSetExpense={noop}
          onSetIncome={noop}
          showTypeToggle={false}
        />
        {amountError ? (
          <Text style={styles.amountError}>{amountError}</Text>
        ) : null}
      </View>

      <SettingsFormCard>
        <TextField
          label="Name"
          placeholder={copy.namePlaceholder}
          value={name}
          onChangeText={onNameChange}
          maxLength={80}
          autoCapitalize="words"
        />

        <View style={styles.group}>
          <Text style={formStyles.fieldLabel}>Repeats</Text>
          <View style={styles.chipRow}>
            <SegmentChip
              label="Monthly"
              selected={!isYearly}
              onPress={() => onCadenceChange("monthly")}
            />
            <SegmentChip
              label="Yearly"
              selected={isYearly}
              onPress={() => onCadenceChange("yearly")}
            />
          </View>
        </View>

        {isYearly ? (
          <SelectDropdown
            label="Month"
            options={MONTH_OPTIONS}
            value={String(monthOfYear)}
            onChange={(value) => onMonthChange(Number(value))}
            maxVisibleOptions={6}
          />
        ) : null}

        <View>
          <TextField
            label="Day of month"
            placeholder="1 to 31"
            value={dayOfMonthText}
            onChangeText={onDayOfMonthChange}
            keyboardType="number-pad"
            maxLength={2}
            showClear={false}
            errorMessage={dayError}
          />
          <Text style={styles.hint}>
            In months with fewer days, it falls on the last day of the month.
          </Text>
        </View>

        <View style={styles.group}>
          <Text style={formStyles.fieldLabel}>Category</Text>
          <ManualAddCategorySection
            categoriesLoading={categoriesLoading}
            visibleCategories={categories}
            categoryId={categoryId}
            onCategoryPress={onCategoryPress}
          />
        </View>

        <TextField
          label="Note (optional)"
          placeholder="Add a short note"
          value={note}
          onChangeText={onNoteChange}
          maxLength={200}
        />

        <View>
          <SettingsToggleRow
            label="Active"
            subtitle={copy.activeSubtitle}
            value={active}
            onValueChange={onActiveChange}
            showSeparator={showPostCurrentPeriod}
          />
          {showPostCurrentPeriod ? (
            <SettingsToggleRow
              label={postCurrentPeriodLabel(kind, cadence)}
              subtitle="Adds this period's transaction right away so your totals are right."
              value={postCurrentPeriod}
              onValueChange={onPostCurrentPeriodChange}
            />
          ) : null}
        </View>

        <SettingsEditorFooter
          onClear={onClear}
          onSave={onSave}
          clearTitle={isEditing ? "Reset" : "Clear"}
          saveTitle="Save"
          saveLoading={saveLoading}
          saveDisabled={saveDisabled}
          clearDisabled={clearDisabled}
        />
      </SettingsFormCard>

      {onDelete ? (
        <Button
          title="Delete"
          variant="ghostDanger"
          disabled={deleteDisabled}
          onPress={onDelete}
        />
      ) : null}
    </View>
  );
});

function noop() {}

const styles = StyleSheet.create({
  root: {
    gap: spacing.lg,
  },
  amountCard: {
    backgroundColor: surface,
    borderRadius: radius.lg,
  },
  amountError: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: danger,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  group: {
    gap: 0,
  },
  chipRow: {
    flexDirection: "row",
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
