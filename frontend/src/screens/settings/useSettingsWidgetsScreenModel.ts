import { useCallback, useMemo, useState } from "react";

import { useCategories } from "@/features/categories/hooks/useCategories";
import { visibleSpendCategories } from "@/features/transactions/utils/manualAddCategoryUtils";
import { useSessionUserId } from "@/hooks/useSessionUserId";
import {
  getHideWidgetAmounts,
  setHideWidgetAmounts,
} from "@/lib/widgets/widgetPreferences";
import {
  MAX_WIDGET_PRESET_LABEL_LENGTH,
  MAX_WIDGET_PRESETS,
  readWidgetPresets,
  writeWidgetPresets,
  type WidgetPreset,
} from "@/lib/widgets/widgetPresetsMmkv";
import { formatInrCompact } from "@/utils/currency";
import { paiseToRupees, parseAmountInputToPaise } from "@/utils/paise";
import { refreshWidgets } from "@/widgets/refreshWidgets";

type FormState = {
  /** Index being edited, or null for a new preset. */
  index: number | null;
  label: string;
  amountText: string;
  categoryId: string | null;
};

const EMPTY_FORM: FormState = {
  index: null,
  label: "",
  amountText: "",
  categoryId: null,
};

/** Rupees as typed text without a trailing ".0" ("20", "12.5"). */
function amountToText(amount: number): string {
  return String(amount);
}

export function useSettingsWidgetsScreenModel() {
  const { userId } = useSessionUserId();
  const { categories, isLoading } = useCategories("spend");
  const expenseCategories = useMemo(
    () => visibleSpendCategories(categories, "debit"),
    [categories],
  );
  const [hideAmounts, setHideAmounts] = useState(getHideWidgetAmounts);
  // Read from storage for the current account, never copied into state: a sign-in or an account
  // switch can never leave a stale list that a later save would write back.
  const [revision, setRevision] = useState(0);
  const presets = useMemo(
    () => readWidgetPresets(userId),
    // `revision` re-reads after our own writes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId, revision],
  );
  const [form, setForm] = useState<FormState | null>(null);

  const categoryName = useCallback(
    (categoryId: string) =>
      categories.find((category) => category.id === categoryId)?.name ??
      "Category",
    [categories],
  );

  /** Stores the list and redraws the widgets so a new preset button shows at once. */
  const persist = useCallback(
    (next: WidgetPreset[]) => {
      if (!userId) {
        return;
      }
      writeWidgetPresets(userId, next);
      setRevision((current) => current + 1);
      refreshWidgets();
    },
    [userId],
  );

  const onHideAmountsChange = useCallback((hide: boolean) => {
    setHideWidgetAmounts(hide);
    setHideAmounts(hide);
    refreshWidgets();
  }, []);

  const amountPaise = form ? parseAmountInputToPaise(form.amountText) : null;
  const formValid =
    form !== null &&
    form.label.trim().length > 0 &&
    amountPaise !== null &&
    form.categoryId !== null;

  const onFormSave = useCallback(() => {
    if (!form || amountPaise === null || form.categoryId === null) {
      return;
    }
    const preset: WidgetPreset = {
      label: form.label.trim().slice(0, MAX_WIDGET_PRESET_LABEL_LENGTH),
      amount: paiseToRupees(amountPaise),
      categoryId: form.categoryId,
    };
    persist(
      form.index === null
        ? [...presets, preset].slice(0, MAX_WIDGET_PRESETS)
        : presets.map((existing, index) =>
            index === form.index ? preset : existing,
          ),
    );
    setForm(null);
  }, [amountPaise, form, persist, presets]);

  const listItems = useMemo(
    () =>
      presets.map((preset) => ({
        title: `${preset.label} · ${formatInrCompact(preset.amount)}`,
        subtitle: categoryName(preset.categoryId),
      })),
    [categoryName, presets],
  );

  return {
    editorProps: {
      hideAmounts,
      onHideAmountsChange,
      presets: listItems,
      canAddPreset: presets.length < MAX_WIDGET_PRESETS && Boolean(userId),
      onAddPreset: () => setForm(EMPTY_FORM),
      onEditPreset: (index: number) => {
        const preset = presets[index];
        if (preset) {
          setForm({
            index,
            label: preset.label,
            amountText: amountToText(preset.amount),
            categoryId: preset.categoryId,
          });
        }
      },
      onRemovePreset: (index: number) =>
        persist(presets.filter((_, position) => position !== index)),
      form: form
        ? {
            title: form.index === null ? "Add preset" : "Edit preset",
            label: form.label,
            amountText: form.amountText,
            categoryId: form.categoryId,
            saveDisabled: !formValid,
          }
        : null,
      // Presets are expenses: the income category is not offered.
      categories: expenseCategories,
      categoriesLoading: isLoading,
      onLabelChange: (label: string) =>
        setForm((current) => (current ? { ...current, label } : current)),
      onAmountChange: (amountText: string) =>
        setForm((current) => (current ? { ...current, amountText } : current)),
      onCategoryChange: (categoryId: string) =>
        setForm((current) => (current ? { ...current, categoryId } : current)),
      onFormSave,
      onFormCancel: () => setForm(null),
    },
  };
}
