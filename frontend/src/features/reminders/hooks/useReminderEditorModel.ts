import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { isAxiosError } from "axios";
import { format } from "date-fns";
import { useCallback, useMemo, useState } from "react";
import { Keyboard, Platform } from "react-native";

import { useUserSettingsQuery } from "@/features/settings/hooks/useUserSettingsQuery";
import { DEFAULT_USER_SETTINGS } from "@/features/settings/types";
import { useToast } from "@/features/toast/useToast";
import { useCurrentDay } from "@/hooks/useCurrentDay";
import { parseFastApiError } from "@/lib/api/parseFastApiError";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";
import { parseReminderTime } from "@/lib/notifications/parseReminderTime";
import { getDeviceIanaTimezone } from "@/utils/deviceTimezone";

import { leadDayCap } from "../constants";
import type { Reminder, ReminderCadence, ReminderDirection, ReminderFormState } from "../types";
import { fromDayString, toDayString } from "../utils/reminderDates";
import {
  buildCreateBody,
  buildUpdateBody,
  clampLeadDays,
  effectiveLeadDays,
  emptyReminderForm,
  formFromReminder,
  hasChanges,
  toggleLeadDay,
  validateReminderForm,
  visibleFieldErrors,
} from "../utils/reminderForm";
import { useRemindersQuery } from "./useRemindersQuery";
import {
  useCreateReminderMutation,
  useDeleteReminderMutation,
  useUpdateReminderMutation,
} from "./useReminderMutations";

export type UseReminderEditorModelArgs = {
  /**
   * The reminder being edited (the copy the screen was opened with); omit to add a new one. The
   * model reads the current copy from the open list by id and falls back to this one.
   */
  reminder?: Reminder;
  onClose: () => void;
};

function toHHmm(date: Date): string {
  return format(date, "HH:mm");
}

function timeToDate(time: string): Date {
  const parsed = parseReminderTime(time);
  const date = new Date();
  date.setHours(parsed?.hour ?? 9, parsed?.minute ?? 0, 0, 0);
  return date;
}

/** "9:00 AM" for an `HH:MM` string. */
export function formatClockTime(time: string): string {
  return format(timeToDate(time), "h:mm a");
}

/** State and actions of the add / edit reminder page. Mount it fresh for every open. */
export function useReminderEditorModel({
  reminder: opened,
  onClose,
}: UseReminderEditorModelArgs) {
  const isEditing = opened !== undefined;
  // The copy passed through navigation can go stale while the form is open (a repeating reminder
  // advances, another device edits it). Everything is diffed against the live copy, so a field the
  // user did not touch is never sent as a change; untouched fields also follow the live copy.
  const openList = useRemindersQuery("open", { enabled: isEditing });
  const reminder = useMemo(
    () => (opened ? (openList.data?.find((item) => item.id === opened.id) ?? opened) : undefined),
    [opened, openList.data],
  );
  const { showToast } = useToast();
  const today = useCurrentDay();
  const settings = useUserSettingsQuery();
  const createMutation = useCreateReminderMutation();
  const updateMutation = useUpdateReminderMutation();
  const deleteMutation = useDeleteReminderMutation();

  const userDefaults = settings.data ?? DEFAULT_USER_SETTINGS;

  const base = useMemo<ReminderFormState>(
    () => (reminder ? formFromReminder(reminder) : emptyReminderForm(today)),
    [reminder, today],
  );
  const [patch, setPatch] = useState<Partial<ReminderFormState>>({});
  const form = useMemo(() => ({ ...base, ...patch }), [base, patch]);

  const [submitted, setSubmitted] = useState(false);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [iosPicker, setIosPicker] = useState<"date" | "time" | null>(null);

  const update = useCallback((next: Partial<ReminderFormState>) => {
    setFormError(null);
    setPatch((prev) => ({ ...prev, ...next }));
  }, []);

  const context = useMemo(
    () => ({ today, savedDueDate: reminder?.due_date }),
    [reminder?.due_date, today],
  );
  const errors = useMemo(
    () => visibleFieldErrors(form, submitted, context),
    [form, submitted, context],
  );

  const busy =
    createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  const hasEditChanges = useMemo(() => {
    if (!reminder) {
      return true;
    }
    const body = buildUpdateBody(reminder, form, getDeviceIanaTimezone(), today);
    // An invalid form has no body yet: leave Save on so it can explain what is wrong.
    return body === null || hasChanges(body);
  }, [form, reminder, today]);

  const setDirection = useCallback(
    (direction: ReminderDirection) => {
      void triggerHaptic();
      update({ direction });
    },
    [update],
  );

  const setCadence = useCallback(
    (cadence: ReminderCadence) => {
      // Lead days longer than the new repeat allows are dropped rather than left to fail on save.
      update({
        cadence,
        leadDays: form.leadDays === null ? null : clampLeadDays(form.leadDays, cadence),
      });
    },
    [form.leadDays, update],
  );

  const selectedLeadDays = useMemo(
    () => effectiveLeadDays(form, userDefaults.reminderDefaultLeadDays),
    [form, userDefaults.reminderDefaultLeadDays],
  );

  const onLeadDayToggle = useCallback(
    (day: number) => {
      update({ leadDays: toggleLeadDay(selectedLeadDays, day, form.cadence) });
    },
    [form.cadence, selectedLeadDays, update],
  );

  const onUseDefaultLeadDays = useCallback(() => {
    void triggerHaptic();
    update({ leadDays: null });
  }, [update]);

  const dueDate = useMemo(() => fromDayString(form.dueDate), [form.dueDate]);
  // A new reminder may be dated yesterday at the earliest (the API refuses anything older).
  const minimumDate = useMemo(
    () => (isEditing ? undefined : new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)),
    [isEditing, today],
  );

  const onDateRowPress = useCallback(() => {
    void triggerHaptic();
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: dueDate,
        mode: "date",
        minimumDate,
        onChange: (_event, date) => {
          if (date) {
            update({ dueDate: toDayString(date) });
          }
        },
      });
      return;
    }
    setIosPicker((current) => (current === "date" ? null : "date"));
  }, [dueDate, minimumDate, update]);

  const remindTimeDate = useMemo(
    () => timeToDate(form.remindTime ?? userDefaults.reminderTime),
    [form.remindTime, userDefaults.reminderTime],
  );

  const onTimeRowPress = useCallback(() => {
    void triggerHaptic();
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: remindTimeDate,
        mode: "time",
        onChange: (_event, date) => {
          if (date) {
            update({ remindTime: toHHmm(date) });
          }
        },
      });
      return;
    }
    setIosPicker((current) => (current === "time" ? null : "time"));
  }, [remindTimeDate, update]);

  const onIosPickerChange = useCallback(
    (mode: "date" | "time", date: Date | undefined) => {
      setIosPicker(null);
      if (!date) {
        return;
      }
      update(mode === "date" ? { dueDate: toDayString(date) } : { remindTime: toHHmm(date) });
    },
    [update],
  );

  const onUseDefaultTime = useCallback(() => {
    void triggerHaptic();
    update({ remindTime: null });
  }, [update]);

  /** A rejected save (422 validation, 409 limit) is shown on the form; anything else is a toast. */
  const reportFailure = useCallback(
    (error: unknown) => {
      const message = parseFastApiError(error);
      const status = isAxiosError(error) ? error.response?.status : undefined;
      if (status === 422 || status === 409 || status === 400) {
        setFormError(message);
        return;
      }
      showToast({ variant: "error", message });
    },
    [showToast],
  );

  const onSave = useCallback(async () => {
    if (busy) {
      return;
    }
    if (!validateReminderForm(form, context).ok) {
      setSubmitted(true);
      return;
    }
    Keyboard.dismiss();
    setFormError(null);
    try {
      if (reminder) {
        const body = buildUpdateBody(reminder, form, getDeviceIanaTimezone(), today);
        if (!body || !hasChanges(body)) {
          onClose();
          return;
        }
        await updateMutation.mutateAsync({ id: reminder.id, body });
        showToast({ variant: "success", message: "Reminder updated" });
      } else {
        const body = buildCreateBody(form, getDeviceIanaTimezone(), context);
        if (!body) {
          return;
        }
        await createMutation.mutateAsync(body);
        showToast({ variant: "success", message: "Reminder added" });
      }
      onClose();
    } catch (error) {
      reportFailure(error);
    }
  }, [
    busy,
    context,
    createMutation,
    form,
    onClose,
    reminder,
    reportFailure,
    showToast,
    today,
    updateMutation,
  ]);

  const onConfirmDelete = useCallback(async () => {
    if (!reminder) {
      return;
    }
    try {
      await deleteMutation.mutateAsync(reminder.id);
      setDeleteVisible(false);
      showToast({ variant: "success", message: "Reminder deleted" });
      onClose();
    } catch (error) {
      setDeleteVisible(false);
      showToast({ variant: "error", message: parseFastApiError(error) });
    }
  }, [deleteMutation, onClose, reminder, showToast]);

  return {
    isEditing,
    form,
    errors,
    formError,
    update,
    setDirection,
    setCadence,
    leadDayCap: leadDayCap(form.cadence),
    selectedLeadDays,
    userDefaultLeadDays: userDefaults.reminderDefaultLeadDays,
    userDefaultTime: userDefaults.reminderTime,
    myUpiId: userDefaults.upiId,
    onLeadDayToggle,
    onUseDefaultLeadDays,
    dueDate,
    minimumDate,
    onDateRowPress,
    remindTimeDate,
    onTimeRowPress,
    onUseDefaultTime,
    iosPicker,
    onIosPickerChange,
    saving: createMutation.isPending || updateMutation.isPending,
    deleting: deleteMutation.isPending,
    busy,
    saveDisabled: isEditing && !hasEditChanges,
    onSave: () => void onSave(),
    deleteVisible,
    onDeletePress: () => {
      void triggerHaptic();
      setDeleteVisible(true);
    },
    onDeleteCancel: () => setDeleteVisible(false),
    onDeleteConfirm: () => void onConfirmDelete(),
  };
}
