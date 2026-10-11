import { memo } from "react";

import { useSettingsToggleBusyGate } from "../hooks/useSettingsToggleBusyGate";
import { SettingsEditorFooter } from "./SettingsEditorFooter";
import { SettingsFormCard } from "./SettingsFormCard";
import { SettingsToggleRow } from "./SettingsToggleRow";

export type SettingsEmailEditorProps = {
  weeklyEmailEnabled: boolean;
  monthlyEmailEnabled: boolean;
  togglesDisabled?: boolean;
  onWeeklyEmailChange: (enabled: boolean) => void;
  onMonthlyEmailChange: (enabled: boolean) => void;
  onClear: () => void;
  onSave: () => void;
  saveLoading?: boolean;
  saveDisabled?: boolean;
  clearDisabled?: boolean;
};

export const SettingsEmailEditor = memo(function SettingsEmailEditor({
  weeklyEmailEnabled,
  monthlyEmailEnabled,
  togglesDisabled = false,
  onWeeklyEmailChange,
  onMonthlyEmailChange,
  onClear,
  onSave,
  saveLoading = false,
  saveDisabled = false,
  clearDisabled = false,
}: SettingsEmailEditorProps) {
  const { busy, onAnimationBusyChange, deferDisabled } =
    useSettingsToggleBusyGate();

  return (
    <SettingsFormCard>
      <SettingsToggleRow
        label="Weekly spend letter"
        subtitle="Monday 08:00 IST. Previous Monday–Sunday, even if you spent ₹0."
        value={weeklyEmailEnabled}
        onValueChange={onWeeklyEmailChange}
        disabled={togglesDisabled}
        showSeparator
        onAnimationBusyChange={onAnimationBusyChange}
      />
      <SettingsToggleRow
        label="Monthly spend letter"
        subtitle="1st of the month at 08:00 IST. Previous calendar month, even if ₹0."
        value={monthlyEmailEnabled}
        onValueChange={onMonthlyEmailChange}
        disabled={togglesDisabled}
        onAnimationBusyChange={onAnimationBusyChange}
      />

      <SettingsEditorFooter
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
