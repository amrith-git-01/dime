import { memo } from "react";

import { useSettingsToggleBusyGate } from "../hooks/useSettingsToggleBusyGate";
import { SettingsFormCard } from "./SettingsFormCard";
import { SettingsToggleRow } from "./SettingsToggleRow";

export type DeviceNotificationsSectionProps = {
  enabled: boolean;
  disabled?: boolean;
  onEnabledChange: (enabled: boolean) => void;
};

/** Local device-notification preference — own card, not grouped with in-app alerts. */
export const DeviceNotificationsSection = memo(
  function DeviceNotificationsSection({
    enabled,
    disabled = false,
    onEnabledChange,
  }: DeviceNotificationsSectionProps) {
    const { onAnimationBusyChange } = useSettingsToggleBusyGate();

    return (
      <SettingsFormCard>
        <SettingsToggleRow
          label="Device notifications"
          subtitle="Show Dime alerts in the Android notification tray."
          value={enabled}
          onValueChange={onEnabledChange}
          disabled={disabled}
          onAnimationBusyChange={onAnimationBusyChange}
        />
      </SettingsFormCard>
    );
  },
);
