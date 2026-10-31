import DateTimePicker from "@react-native-community/datetimepicker";
import { format } from "date-fns";
import { Calendar, Clock } from "lucide-react-native";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import { ConfirmModal } from "@/components/shared";
import {
  Button,
  SlidingSegmentedControl,
  type SlidingSegmentedOption,
  TextField,
} from "@/components/ui";
import { fontFamilies, radius, spacing } from "@/constants";
import { ManualAddAmountSection } from "@/features/transactions/components/bento/ManualAddAmountSection";
import { createThemedStyles, useTheme } from "@/theme";

import { REMINDER_LEAD_DAY_OPTIONS } from "../constants";
import { formatClockTime, useReminderEditorModel } from "../hooks/useReminderEditorModel";
import type { Reminder, ReminderCadence, ReminderDirection } from "../types";
import { LeadDayChips } from "./LeadDayChips";

export type ReminderEditorProps = {
  /** Reminder to edit; omit to add a new one. */
  reminder?: Reminder;
  /** Called after a save or delete (the screen goes back). */
  onDone: () => void;
};

const DIRECTION_OPTIONS: readonly SlidingSegmentedOption<ReminderDirection>[] = [
  { value: "pay", label: "I pay", tone: "danger" },
  { value: "receive", label: "I receive", tone: "success" },
];

const CADENCE_OPTIONS: readonly SlidingSegmentedOption<ReminderCadence>[] = [
  { value: "none", label: "Once" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

// The amount section only uses the type to colour the amount; its switch is hidden here.
const noop = () => undefined;

type PickerRowProps = {
  icon: "date" | "time";
  label: string;
  value: string;
  onPress: () => void;
  errorMessage?: string | null;
};

/** A full-width pill that opens the date or time picker. */
function PickerRow({ icon, label, value, onPress, errorMessage }: PickerRowProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const Icon = icon === "date" ? Calendar : Clock;
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${value}`}
        onPress={onPress}
        style={({ pressed }) => [
          styles.pickerRow,
          Boolean(errorMessage) && styles.pickerRowError,
          pressed && styles.pickerRowPressed,
        ]}
      >
        <Icon size={16} color={colors.inkSoft} strokeWidth={1.5} />
        <View style={styles.pickerText}>
          <Text style={styles.pickerLabel}>{label}</Text>
          <Text style={styles.pickerValue}>{value}</Text>
        </View>
      </Pressable>
      {errorMessage ? (
        <Text style={styles.errorText} accessibilityRole="alert">
          {errorMessage}
        </Text>
      ) : null}
    </View>
  );
}

/** Add / edit form of a reminder (the ReminderEditor page). */
export const ReminderEditor = memo(function ReminderEditor({
  reminder,
  onDone,
}: ReminderEditorProps) {
  const styles = useStyles();
  const { scheme } = useTheme();
  const model = useReminderEditorModel({ reminder, onClose: onDone });
  const { form, errors, update, isEditing } = model;
  const isPay = form.direction === "pay";
  const usingDefaultLeads = form.leadDays === null;
  const defaultList =
    model.userDefaultLeadDays.length > 0
      ? `${model.userDefaultLeadDays.join(", ")} days before`
      : "none";
  const usingDefaultTime = form.remindTime === null;
  const timeLabel = formatClockTime(form.remindTime ?? model.userDefaultTime);

  return (
    <View style={styles.content}>
      <ConfirmModal
        visible={model.deleteVisible}
        title="Delete this reminder?"
        message="It stops reminding you. Transactions you have added stay in your history."
        confirmLabel="Delete"
        confirmBusyLabel="Deleting"
        confirmTone="danger"
        confirmLoading={model.deleting}
        onCancel={model.onDeleteCancel}
        onConfirm={model.onDeleteConfirm}
      />

      <View style={[styles.amountCard, styles.cardShadow]}>
        <View style={styles.directionWrap}>
          <SlidingSegmentedControl
            options={DIRECTION_OPTIONS}
            value={form.direction}
            onChange={model.setDirection}
          />
        </View>
        <ManualAddAmountSection
          amountText={form.amountText}
          amountFocused={false}
          onAmountChange={(amountText) => update({ amountText })}
          onAmountFocus={noop}
          onAmountBlur={noop}
          txType={isPay ? "debit" : "credit"}
          onSetExpense={noop}
          onSetIncome={noop}
          showTypeToggle={false}
          errorMessage={errors.amount ?? null}
        />
        <Text style={styles.amountHint}>
          Optional. Leave it empty if the amount changes.
        </Text>
      </View>

      <View style={[styles.card, styles.cardShadow]}>
        <View style={styles.cardHeader}>
          <Text style={styles.sectionLabel}>WHAT FOR</Text>
          <Text style={styles.hintInline}>(required)</Text>
        </View>
        <View style={styles.cardBody}>
          <TextField
            label="Title"
            hideLabel
            placeholder={isPay ? "e.g. Rent, Credit card bill" : "e.g. Dinner split, Loan back"}
            value={form.title}
            onChangeText={(title) => update({ title })}
            maxLength={80}
            autoCapitalize="sentences"
            errorMessage={errors.title ?? null}
          />
          <TextField
            label={isPay ? "Who you pay (optional)" : "Who pays you (optional)"}
            placeholder="Name"
            value={form.name}
            onChangeText={(name) => update({ name })}
            maxLength={80}
            autoCapitalize="words"
            errorMessage={errors.name ?? null}
          />
          {isPay ? (
            <TextField
              label="Their UPI ID (optional)"
              placeholder="name@bank"
              value={form.upiId}
              onChangeText={(upiId) => update({ upiId })}
              maxLength={100}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              errorMessage={errors.upi ?? null}
            />
          ) : (
            <Text style={styles.hint}>
              {model.myUpiId
                ? "Nudges include a pay link for your UPI ID from Settings."
                : "Add your UPI ID in Settings, Notifications & alerts, to put a pay link in nudges."}
            </Text>
          )}
          {isPay ? (
            <Text style={styles.hint}>
              With their UPI ID and an amount, Pay now opens your UPI app.
            </Text>
          ) : null}
        </View>
      </View>

      <View style={[styles.card, styles.cardShadow]}>
        <View style={styles.cardHeader}>
          <Text style={styles.sectionLabel}>DUE</Text>
          <Text style={styles.hintInline}>(required)</Text>
        </View>
        <View style={styles.cardBody}>
          <PickerRow
            icon="date"
            label="Due date"
            value={format(model.dueDate, "EEE d MMM yyyy")}
            onPress={model.onDateRowPress}
            errorMessage={errors.date ?? null}
          />
          {model.iosPicker === "date" ? (
            <View style={styles.iosPicker}>
              <DateTimePicker
                value={model.dueDate}
                mode="date"
                display="compact"
                themeVariant={scheme}
                minimumDate={model.minimumDate}
                onChange={(_event, date) => model.onIosPickerChange("date", date)}
              />
            </View>
          ) : null}
          <SlidingSegmentedControl
            options={CADENCE_OPTIONS}
            value={form.cadence}
            onChange={model.setCadence}
          />
          {form.cadence === "monthly" || form.cadence === "yearly" ? (
            <Text style={styles.hint}>
              In shorter months it falls on the last day of the month.
            </Text>
          ) : null}
        </View>
      </View>

      <View style={[styles.card, styles.cardShadow]}>
        <View style={styles.cardHeader}>
          <Text style={styles.sectionLabel}>REMIND ME</Text>
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.hint}>
            {usingDefaultLeads
              ? `Your default: ${defaultList}.`
              : "Remind me this many days before it is due."}
          </Text>
          <LeadDayChips
            options={REMINDER_LEAD_DAY_OPTIONS}
            selected={model.selectedLeadDays}
            onToggle={model.onLeadDayToggle}
            cap={model.leadDayCap}
          />
          {errors.leadDays ? (
            <Text style={styles.errorText} accessibilityRole="alert">
              {errors.leadDays}
            </Text>
          ) : null}
          {usingDefaultLeads ? null : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Use my default reminder days"
              onPress={model.onUseDefaultLeadDays}
              style={styles.linkButton}
            >
              <Text style={styles.linkText}>Use my default</Text>
            </Pressable>
          )}
          <PickerRow
            icon="time"
            label={usingDefaultTime ? "Reminder time (your default)" : "Reminder time"}
            value={timeLabel}
            onPress={model.onTimeRowPress}
          />
          {model.iosPicker === "time" ? (
            <View style={styles.iosPicker}>
              <DateTimePicker
                value={model.remindTimeDate}
                mode="time"
                display="compact"
                themeVariant={scheme}
                onChange={(_event, date) => model.onIosPickerChange("time", date)}
              />
            </View>
          ) : null}
          {usingDefaultTime ? null : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Use my default reminder time"
              onPress={model.onUseDefaultTime}
              style={styles.linkButton}
            >
              <Text style={styles.linkText}>Use my default time</Text>
            </Pressable>
          )}
        </View>
      </View>

      {model.formError ? (
        <Text style={styles.errorText} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {model.formError}
        </Text>
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
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  directionWrap: {
    paddingHorizontal: spacing.lg,
  },
  amountHint: {
    paddingHorizontal: spacing.lg,
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkSoft,
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
  hintInline: {
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    color: colors.inkSoft,
  },
  hint: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkSoft,
  },
  errorText: {
    marginTop: spacing.xs,
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.danger,
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  pickerRowError: {
    borderColor: colors.danger,
  },
  pickerRowPressed: {
    backgroundColor: colors.surfaceSunken,
  },
  pickerText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  pickerLabel: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkSoft,
  },
  pickerValue: {
    fontFamily: fontFamilies.medium,
    fontSize: 15,
    lineHeight: 20,
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
  iosPicker: {
    alignItems: "flex-start",
  },
  linkButton: {
    alignSelf: "flex-start",
    minHeight: 44,
    justifyContent: "center",
  },
  linkText: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.accentText,
  },
  actionsRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  actionSlot: {
    flex: 1,
  },
}));
