import { memo } from "react";

import { useSettingsToggleBusyGate } from "../hooks/useSettingsToggleBusyGate";
import { BentoEditorFooter } from "@/components/bento";
import { SettingsFormCard } from "./SettingsFormCard";
import { SettingsToggleRow } from "./SettingsToggleRow";

export type SettingsHapticEditorProps = {
  hapticFeedbackEnabled: boolean;
  togglesDisabled?: boolean;
  onHapticFeedbackChange: (enabled: boolean) => void;
  onClear: () => void;
  onSave: () => void;
  saveLoading?: boolean;
  saveDisabled?: boolean;
  clearDisabled?: boolean;
};

export const SettingsHapticEditor = memo(function SettingsHapticEditor({
  hapticFeedbackEnabled,
  togglesDisabled = false,
  onHapticFeedbackChange,
  onClear,
  onSave,
  saveLoading = false,
  saveDisabled = false,
  clearDisabled = false,
}: SettingsHapticEditorProps) {
  const { busy, onAnimationBusyChange, deferDisabled } =
    useSettingsToggleBusyGate();

  return (
    <SettingsFormCard>
      <SettingsToggleRow
        accessibilityLabel="Haptic feedback"
        subtitle="Turn off to disable all in-app haptic feedback on this device."
        value={hapticFeedbackEnabled}
        onValueChange={onHapticFeedbackChange}
        disabled={togglesDisabled}
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
