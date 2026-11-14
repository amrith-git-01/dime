import { memo } from "react";
import { StyleSheet, View } from "react-native";

import { SETTINGS_SECTION_GAP } from "../constants/settingsTokens";
import { useSettingsToggleBusyGate } from "../hooks/useSettingsToggleBusyGate";
import { DailyExpenseReminderSection } from "./DailyExpenseReminderSection";
import { DeviceNotificationsSection } from "./DeviceNotificationsSection";
import { BentoEditorFooter } from "@/components/bento";
import { SettingsFormCard } from "./SettingsFormCard";
import { SettingsToggleRow } from "./SettingsToggleRow";

export type SettingsNotificationsEditorProps = {
  deviceNotificationsEnabled: boolean;
  onDeviceNotificationsChange: (enabled: boolean) => void;
  dailyExpenseReminderEnabled: boolean;
  dailyExpenseReminderTime: string;
  onDailyExpenseReminderEnabledChange: (enabled: boolean) => void;
  onDailyExpenseReminderTimeChange: (time: string) => void;
  autoCaptureAlertsEnabled: boolean;
  captureFailedAlertsEnabled: boolean;
  togglesDisabled?: boolean;
  onAutoCaptureAlertsChange: (enabled: boolean) => void;
  onCaptureFailedAlertsChange: (enabled: boolean) => void;
  onClear: () => void;
  onSave: () => void;
  saveLoading?: boolean;
  saveDisabled?: boolean;
  clearDisabled?: boolean;
};

export const SettingsNotificationsEditor = memo(
  function SettingsNotificationsEditor({
    deviceNotificationsEnabled,
    onDeviceNotificationsChange,
    dailyExpenseReminderEnabled,
    dailyExpenseReminderTime,
    onDailyExpenseReminderEnabledChange,
    onDailyExpenseReminderTimeChange,
    autoCaptureAlertsEnabled,
    captureFailedAlertsEnabled,
    togglesDisabled = false,
    onAutoCaptureAlertsChange,
    onCaptureFailedAlertsChange,
    onClear,
    onSave,
    saveLoading = false,
    saveDisabled = false,
    clearDisabled = false,
  }: SettingsNotificationsEditorProps) {
    const { busy, onAnimationBusyChange, deferDisabled } =
      useSettingsToggleBusyGate();

    return (
      <View style={styles.root}>
        <DeviceNotificationsSection
          enabled={deviceNotificationsEnabled}
          disabled={togglesDisabled}
          onEnabledChange={onDeviceNotificationsChange}
        />

        <DailyExpenseReminderSection
          enabled={dailyExpenseReminderEnabled}
          time={dailyExpenseReminderTime}
          disabled={togglesDisabled}
          onEnabledChange={onDailyExpenseReminderEnabledChange}
          onTimeChange={onDailyExpenseReminderTimeChange}
        />

        <SettingsFormCard>
          <SettingsToggleRow
            label="Transaction added alerts"
            subtitle="When Dime auto-adds a transaction from a scan or voice."
            value={autoCaptureAlertsEnabled}
            onValueChange={onAutoCaptureAlertsChange}
            disabled={togglesDisabled}
            onAnimationBusyChange={onAnimationBusyChange}
            showSeparator
          />
          <SettingsToggleRow
            label="Capture failures"
            subtitle="When a receipt scan could not be processed."
            value={captureFailedAlertsEnabled}
            onValueChange={onCaptureFailedAlertsChange}
            disabled={togglesDisabled}
            onAnimationBusyChange={onAnimationBusyChange}
          />
        </SettingsFormCard>

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
      </View>
    );
  },
);

const styles = StyleSheet.create({
  root: {
    gap: SETTINGS_SECTION_GAP,
  },
});
