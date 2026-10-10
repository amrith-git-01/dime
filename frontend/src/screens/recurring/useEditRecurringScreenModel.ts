import type { RouteProp } from "@react-navigation/native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Keyboard } from "react-native";

import type { RecurringEditorProps } from "@/features/recurring/components";
import { useCategories } from "@/features/categories/hooks/useCategories";
import type { CategoryRow } from "@/features/categories/types";
import {
  useCreateRecurringMutation,
  useDeleteRecurringMutation,
  useUpdateRecurringMutation,
} from "@/features/recurring/hooks/useRecurringMutations";
import { useRecurringQuery } from "@/features/recurring/hooks/useRecurringQuery";
import type {
  RecurringCadence,
  RecurringFormState,
} from "@/features/recurring/types";
import { RECURRING_COPY } from "@/features/recurring/utils/recurringDisplay";
import {
  buildCreateBody,
  buildUpdateBody,
  emptyRecurringForm,
  formFromItem,
  hasChanges,
  isCurrentPeriodDuePassed,
  parseDayOfMonth,
  validateRecurringForm,
} from "@/features/recurring/utils/recurringForm";
import { useToast } from "@/features/toast/useToast";
import { findIncomeCategory } from "@/features/transactions/utils/manualAddCategoryUtils";
import { parseFastApiError } from "@/lib/api/parseFastApiError";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";
import type { MainStackParamList } from "@/navigation/types";
import { getDeviceIanaTimezone } from "@/utils/deviceTimezone";

type EditRoute = RouteProp<MainStackParamList, "EditRecurring">;

export function useEditRecurringScreenModel() {
  const navigation =
    useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { kind, recurringId } = useRoute<EditRoute>().params;
  const isEditing = recurringId !== undefined;
  const copy = RECURRING_COPY[kind];
  const { showToast } = useToast();

  const listQuery = useRecurringQuery(kind);
  const item = useMemo(
    () => listQuery.data?.items.find((row) => row.id === recurringId),
    [listQuery.data, recurringId],
  );
  const { categories, isLoading: categoriesLoading } = useCategories();

  const createMutation = useCreateRecurringMutation();
  const updateMutation = useUpdateRecurringMutation();
  const deleteMutation = useDeleteRecurringMutation();

  // What the form shows before the user edits it: the saved item, or sensible defaults. Edits are
  // kept as a patch on top so late-arriving data (categories) still fills untouched fields.
  const incomeCategoryId = useMemo(
    () =>
      kind === "income" ? (findIncomeCategory(categories)?.id ?? null) : null,
    [categories, kind],
  );
  const base = useMemo<RecurringFormState | null>(() => {
    if (isEditing) {
      return item ? formFromItem(item) : null;
    }
    return emptyRecurringForm(kind, new Date(), incomeCategoryId);
  }, [incomeCategoryId, isEditing, item, kind]);
  const [patch, setPatch] = useState<Partial<RecurringFormState>>({});
  const form = useMemo(
    () => (base ? { ...base, ...patch } : null),
    [base, patch],
  );

  const [amountFocused, setAmountFocused] = useState(false);
  const [deleteVisible, setDeleteVisible] = useState(false);

  const update = useCallback((next: Partial<RecurringFormState>) => {
    setPatch((prev) => ({ ...prev, ...next }));
  }, []);

  // The item vanished (deleted elsewhere) once the list has loaded: leave the screen.
  const missing = isEditing && !listQuery.isPending && !item;
  useEffect(() => {
    if (missing) {
      showToast({ variant: "info", message: "That item no longer exists" });
      navigation.goBack();
    }
  }, [missing, navigation, showToast]);

  const visibleCategories = useMemo(
    () =>
      kind === "income"
        ? categories
        : categories.filter((category) => category.name !== "Income"),
    [categories, kind],
  );

  const validation = useMemo(
    () => (form ? validateRecurringForm(form) : null),
    [form],
  );
  const updateBody = useMemo(
    () =>
      isEditing && item && form
        ? buildUpdateBody(item, form, getDeviceIanaTimezone())
        : null,
    [form, isEditing, item],
  );

  const showPostCurrentPeriod = useMemo(() => {
    if (isEditing || !form) {
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
  }, [form, isEditing]);

  const saveLoading = createMutation.isPending || updateMutation.isPending;
  const hasPatch = Object.keys(patch).length > 0;
  const valid = validation?.ok === true;
  const saveDisabled =
    saveLoading ||
    !valid ||
    (isEditing && (updateBody === null || !hasChanges(updateBody)));

  const onSave = useCallback(async () => {
    if (!form || saveDisabled) {
      return;
    }
    Keyboard.dismiss();
    try {
      if (isEditing && item) {
        const body = buildUpdateBody(item, form, getDeviceIanaTimezone());
        if (!body || !hasChanges(body)) {
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
      navigation.goBack();
    } catch (error) {
      showToast({ variant: "error", message: parseFastApiError(error) });
    }
  }, [
    copy,
    createMutation,
    form,
    isEditing,
    item,
    kind,
    navigation,
    saveDisabled,
    showToast,
    updateMutation,
  ]);

  const onClear = useCallback(() => {
    void triggerHaptic();
    Keyboard.dismiss();
    setPatch({});
    setAmountFocused(false);
  }, []);

  const onCategoryPress = useCallback(
    (category: CategoryRow, selected: boolean) => {
      void triggerHaptic();
      update({ categoryId: selected ? null : category.id });
    },
    [update],
  );

  const onCadenceChange = useCallback(
    (cadence: RecurringCadence) => update({ cadence }),
    [update],
  );

  const onConfirmDelete = useCallback(async () => {
    if (!item) {
      return;
    }
    try {
      await deleteMutation.mutateAsync(item.id);
      setDeleteVisible(false);
      showToast({ variant: "success", message: copy.deletedToast });
      navigation.goBack();
    } catch (error) {
      setDeleteVisible(false);
      showToast({ variant: "error", message: parseFastApiError(error) });
    }
  }, [copy, deleteMutation, item, navigation, showToast]);

  const fieldError = (field: "amount" | "day"): string | null => {
    if (!form || !validation || validation.ok || validation.field !== field) {
      return null;
    }
    // Stay quiet until there is something to correct (empty fields just disable Save).
    const text = field === "amount" ? form.amountText : form.dayOfMonthText;
    return text.trim().length > 0 ? validation.error : null;
  };

  const editorProps: RecurringEditorProps | null = form
    ? {
        kind,
        isEditing,
        name: form.name,
        onNameChange: (name) => update({ name }),
        amountText: form.amountText,
        amountFocused,
        onAmountChange: (amountText) => update({ amountText }),
        onAmountFocus: () => setAmountFocused(true),
        onAmountBlur: () => setAmountFocused(false),
        amountError: fieldError("amount"),
        cadence: form.cadence,
        onCadenceChange,
        monthOfYear: form.monthOfYear,
        onMonthChange: (monthOfYear) => update({ monthOfYear }),
        dayOfMonthText: form.dayOfMonthText,
        onDayOfMonthChange: (dayOfMonthText) => update({ dayOfMonthText }),
        dayError: fieldError("day"),
        categoriesLoading,
        categories: visibleCategories,
        categoryId: form.categoryId,
        onCategoryPress,
        note: form.note,
        onNoteChange: (note) => update({ note }),
        active: form.active,
        onActiveChange: (active) => update({ active }),
        showPostCurrentPeriod,
        postCurrentPeriod: form.postCurrentPeriod,
        onPostCurrentPeriodChange: (postCurrentPeriod) =>
          update({ postCurrentPeriod }),
        saveLoading,
        saveDisabled,
        clearDisabled: !hasPatch || saveLoading,
        onSave: () => void onSave(),
        onClear,
        onDelete: isEditing
          ? () => {
              void triggerHaptic();
              setDeleteVisible(true);
            }
          : undefined,
        deleteDisabled: saveLoading,
      }
    : null;

  return {
    editorProps,
    deleteConfirmModalProps: {
      visible: deleteVisible,
      title: copy.deleteTitle,
      message: copy.deleteMessage,
      onCancel: () => setDeleteVisible(false),
      onConfirm: () => void onConfirmDelete(),
      confirmLoading: deleteMutation.isPending,
    },
  };
}
