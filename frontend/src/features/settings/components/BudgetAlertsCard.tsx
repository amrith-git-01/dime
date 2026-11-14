import { memo } from "react";

import { BentoEditorFooter } from "@/components/bento";

import { useSettingsToggleBusyGate } from "../hooks/useSettingsToggleBusyGate";
import { BudgetAlertScopeBlock } from "./BudgetAlertScopeBlock";
import { SettingsFormCard } from "./SettingsFormCard";

export type BudgetAlertsCardProps = {
  budgetMonthlyAlertsEnabled: boolean;
  budgetMonthlyWarnPct: number;
  budgetCategoryAlertsEnabled: boolean;
  budgetCategoryWarnPct: number;
  /** Incremented on Clear to resync the Custom % fields. */
  syncKey?: number;
  togglesDisabled?: boolean;
  onBudgetMonthlyAlertsChange: (enabled: boolean) => void;
  onBudgetMonthlyWarnPctChange: (pct: number) => void;
  onBudgetCategoryAlertsChange: (enabled: boolean) => void;
  onBudgetCategoryWarnPctChange: (pct: number) => void;
  onClear: () => void;
  onSave: () => void;
  saveLoading?: boolean;
  saveDisabled?: boolean;
  clearDisabled?: boolean;
};

/** Budgets: when Dime warns about the monthly cap and the category caps, with its own Save and Clear. */
export const BudgetAlertsCard = memo(function BudgetAlertsCard({
  budgetMonthlyAlertsEnabled,
  budgetMonthlyWarnPct,
  budgetCategoryAlertsEnabled,
  budgetCategoryWarnPct,
  syncKey = 0,
  togglesDisabled = false,
  onBudgetMonthlyAlertsChange,
  onBudgetMonthlyWarnPctChange,
  onBudgetCategoryAlertsChange,
  onBudgetCategoryWarnPctChange,
  onClear,
  onSave,
  saveLoading = false,
  saveDisabled = false,
  clearDisabled = false,
}: BudgetAlertsCardProps) {
  const { busy, onAnimationBusyChange, deferDisabled } =
    useSettingsToggleBusyGate();

  return (
    <SettingsFormCard
      title="Budget alerts"
      subtitle="A push when spending nears a budget limit, and when it goes over."
    >
      <BudgetAlertScopeBlock
        label="Monthly budget"
        subtitle="Alerts for your monthly spending cap."
        enabled={budgetMonthlyAlertsEnabled}
        warnPct={budgetMonthlyWarnPct}
        syncKey={syncKey}
        disabled={togglesDisabled}
        onEnabledChange={onBudgetMonthlyAlertsChange}
        onWarnPctChange={onBudgetMonthlyWarnPctChange}
        onAnimationBusyChange={onAnimationBusyChange}
        showSeparator
      />
      <BudgetAlertScopeBlock
        label="Category budgets"
        subtitle="Alerts for category monthly caps."
        enabled={budgetCategoryAlertsEnabled}
        warnPct={budgetCategoryWarnPct}
        syncKey={syncKey}
        disabled={togglesDisabled}
        onEnabledChange={onBudgetCategoryAlertsChange}
        onWarnPctChange={onBudgetCategoryWarnPctChange}
        onAnimationBusyChange={onAnimationBusyChange}
      />

      <BentoEditorFooter
        onClear={() => {
          if (busy) {
            return;
          }
          onClear();
        }}
        onSave={() => {
          if (busy) {
            return;
          }
          onSave();
        }}
        saveTitle="Save"
        saveLoading={saveLoading}
        saveDisabled={deferDisabled(saveDisabled, "save")}
        clearDisabled={deferDisabled(clearDisabled, "clear")}
      />
    </SettingsFormCard>
  );
});
