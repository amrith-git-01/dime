import { memo } from "react";

import { SettingsFormCard } from "./SettingsFormCard";
import { SettingsToggleRow } from "./SettingsToggleRow";

export type SettingsCaptureEditorProps = {
  upiEnabled: boolean;
  onUpiChange: (enabled: boolean) => void;
};

export const SettingsCaptureEditor = memo(function SettingsCaptureEditor({
  upiEnabled,
  onUpiChange,
}: SettingsCaptureEditorProps) {
  return (
    <SettingsFormCard>
      <SettingsToggleRow
        label="UPI app hints"
        subtitle="Use UPI notifications to suggest amounts and payees."
        value={upiEnabled}
        onValueChange={onUpiChange}
      />
    </SettingsFormCard>
  );
});
