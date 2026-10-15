import { useCallback, useMemo, useState } from "react";
import { Keyboard } from "react-native";

import { useCategories } from "@/features/categories/hooks/useCategories";
import type { CategoryRow } from "@/features/categories/types";
import { useToast } from "@/features/toast/useToast";
import { parseFastApiError } from "@/lib/api/parseFastApiError";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";
import { getDeviceIanaTimezone } from "@/utils/deviceTimezone";

import type {
  RecurringFormState,
  RecurringItem,
  RecurringKind,
} from "../types";
import { RECURRING_COPY } from "../utils/recurringDisplay";
import {
  buildCreateBody,
  buildUpdateBody,
  DEFAULT_INCOME_CATEGORY_NAME,
  emptyRecurringForm,
  formFromItem,
  hasChanges,
  isCurrentPeriodDuePassed,
  parseDayOfMonth,
  recurringCategoryScope,
  validateRecurringForm,
  visibleFieldErrors,
} from "../utils/recurringForm";
import {
  useCreateRecurringMutation,
  useDeleteRecurringMutation,
  useUpdateRecurringMutation,
} from "./useRecurringMutations";

export type UseRecurringSheetModelArgs = {
  /** Kind chosen by the card that opened the page (create only; edit uses the item's). */
  kind: RecurringKind;
  /** The item being edited; omit to add a new one. */
  item?: RecurringItem;
  onClose: () => void;
};

/** State and actions of the add / edit recurring sheet. Mount it fresh for every open. */
export function useRecurringSheetModel({
  kind: initialKind,
  item,
  onClose,
}: UseRecurringSheetModelArgs) {
  const isEditing = item !== undefined;
  const { showToast } = useToast();
  const createMutation = useCreateRecurringMutation();
  const updateMutation = useUpdateRecurringMutation();
  const deleteMutation = useDeleteRecurringMutation();

  const kind = item ? item.kind : initialKind;
  const copy = RECURRING_COPY[kind];

  // The recurring categories of this kind (Rent, Subscriptions ... or Salary, Freelance ...).
  const { categories: pickerCategories, isLoading: categoriesLoading } =
    useCategories(recurringCategoryScope(kind));

  const salaryCategoryId = useMemo(
    () =>
      pickerCategories.find(
        (category) => category.name === DEFAULT_INCOME_CATEGORY_NAME,
      )?.id ?? null,
    [pickerCategories],
  );

  // What the form shows before the user edits it; edits are a patch on top, so late-arriving
  // categories still fill untouched fields.
  const base = useMemo<RecurringFormState>(
    () =>
      item
        ? formFromItem(item)
        : emptyRecurringForm(kind, new Date(), salaryCategoryId),
    [salaryCategoryId, item, kind],
  );
  const [patch, setPatch] = useState<Partial<RecurringFormState>>({});
  const form = useMemo(() => ({ ...base, ...patch }), [base, patch]);

  const [submitted, setSubmitted] = useState(false);
  const [deleteVisible, setDeleteVisible] = useState(false);

  const update = useCallback((next: Partial<RecurringFormState>) => {
    setPatch((prev) => ({ ...prev, ...next }));
  }, []);

  const onCategoryPress = useCallback(
    (category: CategoryRow) => {
      void triggerHaptic();
      update({ categoryId: category.id });
    },
    [update],
  );

  const errors = useMemo(
    () => visibleFieldErrors(form, submitted),
    [form, submitted],
  );

  const showPostCurrentPeriod = useMemo(() => {
    if (isEditing) {
      return false;
    }
    const dayOfMonth = parseDayOfMonth(form.dayOfMonthText);
    return (
      dayOfMonth !== null &&
      isCurrentPeriodDuePassed(
        {
          cadence: form.cadence,
          dayOfMonth,
          monthOfYear: form.monthOfYear,
        },
        new Date(),
      )
    );
  }, [form.cadence, form.dayOfMonthText, form.monthOfYear, isEditing]);

  const busy =
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending;

  const hasEditChanges = useMemo(() => {
    if (!item) {
      return true;
    }
    const body = buildUpdateBody(item, form, getDeviceIanaTimezone());
    // An invalid form has no body yet: leave Save on so it can explain what is wrong.
    return body === null || hasChanges(body);
  }, [form, item]);

  const onSave = useCallback(async () => {
    if (busy) {
      return;
    }
    if (!validateRecurringForm(form).ok) {
      setSubmitted(true);
      return;
    }
    Keyboard.dismiss();
    try {
      if (item) {
        const body = buildUpdateBody(item, form, getDeviceIanaTimezone());
        if (!body || !hasChanges(body)) {
          onClose();
          return;
        }
        await updateMutation.mutateAsync({ id: item.id, body });
        showToast({ variant: "success", message: copy.updatedToast });
      } else {
        const body = buildCreateBody(
          kind,
          form,
          getDeviceIanaTimezone(),
          new Date(),
        );
        if (!body) {
          return;
        }
        await createMutation.mutateAsync(body);
        showToast({ variant: "success", message: copy.createdToast });
      }
      onClose();
    } catch (error) {
      showToast({ variant: "error", message: parseFastApiError(error) });
    }
  }, [
    busy,
    copy,
    createMutation,
    form,
    item,
    kind,
    onClose,
    showToast,
    updateMutation,
  ]);

  const onConfirmDelete = useCallback(async () => {
    if (!item) {
      return;
    }
    try {
      await deleteMutation.mutateAsync(item.id);
      setDeleteVisible(false);
      showToast({ variant: "success", message: copy.deletedToast });
      onClose();
    } catch (error) {
      setDeleteVisible(false);
      showToast({ variant: "error", message: parseFastApiError(error) });
    }
  }, [copy, deleteMutation, item, onClose, showToast]);

  return {
    kind,
    copy,
    isEditing,
    form,
    errors,
    update,
    categoriesLoading,
    pickerCategories,
    onCategoryPress,
    showPostCurrentPeriod,
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
