import { useCallback } from "react";

import { BUDGET_ALERT_KEYS } from "@/features/settings/constants/settingsSlices";
import { useSettingsDraft } from "@/features/settings/hooks/useSettingsDraft";
import { useToast } from "@/features/toast/useToast";
import { parseFastApiError } from "@/lib/api/parseFastApiError";

/** The Budget alerts card on Budgets: its own draft of the four alert settings, saved on its own. */
export function useBudgetAlertsCardModel() {
  const { showToast } = useToast();
  const { draft, patchDraft, isDirty, isReady, clear, save, saving, syncKey } =
    useSettingsDraft(BUDGET_ALERT_KEYS);

  const handleSave = useCallback(async () => {
    try {
      if (await save()) {
        showToast({ variant: "success", message: "Budget alerts saved" });
      }
    } catch (error: unknown) {
      showToast({
        variant: "error",
        message: parseFastApiError(error) || "Could not save budget alerts.",
      });
    }
  }, [save, showToast]);

  return {
    budgetMonthlyAlertsEnabled: draft.budgetMonthlyAlertsEnabled,
    budgetMonthlyWarnPct: draft.budgetMonthlyWarnPct,
    budgetCategoryAlertsEnabled: draft.budgetCategoryAlertsEnabled,
    budgetCategoryWarnPct: draft.budgetCategoryWarnPct,
    syncKey,
    // Until the settings load there is nothing to compare against: show the defaults, locked.
    togglesDisabled: saving || !isReady,
    saveLoading: saving,
    saveDisabled: !isDirty || saving,
    clearDisabled: !isDirty || saving,
    onBudgetMonthlyAlertsChange: (enabled: boolean) =>
      patchDraft({ budgetMonthlyAlertsEnabled: enabled }),
    onBudgetMonthlyWarnPctChange: (pct: number) =>
      patchDraft({ budgetMonthlyWarnPct: pct }),
    onBudgetCategoryAlertsChange: (enabled: boolean) =>
      patchDraft({ budgetCategoryAlertsEnabled: enabled }),
    onBudgetCategoryWarnPctChange: (pct: number) =>
      patchDraft({ budgetCategoryWarnPct: pct }),
    onClear: clear,
    onSave: () => void handleSave(),
  };
}
