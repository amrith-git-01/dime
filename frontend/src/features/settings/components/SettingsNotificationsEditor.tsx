import { memo } from "react";
import { StyleSheet, View } from "react-native";

import { SETTINGS_SECTION_GAP } from "../constants/settingsTokens";
import { useSettingsToggleBusyGate } from "../hooks/useSettingsToggleBusyGate";
import { BudgetAlertScopeBlock } from "./BudgetAlertScopeBlock";
import { DailyExpenseReminderSection } from "./DailyExpenseReminderSection";
import { DeviceNotificationsSection } from "./DeviceNotificationsSection";
import { SettingsEditorFooter } from "./SettingsEditorFooter";
import { SettingsFormCard } from "./SettingsFormCard";
import { SettingsToggleRow } from "./SettingsToggleRow";

export type SettingsNotificationsEditorProps = {
  deviceNotificationsEnabled: boolean;
  onDeviceNotificationsChange: (enabled: boolean) => void;
  dailyExpenseReminderEnabled: boolean;
  dailyExpenseReminderTime: string;
  onDailyExpenseReminderEnabledChange: (enabled: boolean) => void;
  onDailyExpenseReminderTimeChange: (time: string) => void;
  budgetMonthlyAlertsEnabled: boolean;
  budgetDailyAlertsEnabled: boolean;
  budgetCategoryAlertsEnabled: boolean;
  budgetMonthlyWarnPct: number;
  budgetDailyWarnPct: number;
  budgetCategoryWarnPct: number;
  autoCaptureAlertsEnabled: boolean;
  captureFailedAlertsEnabled: boolean;
  togglesDisabled?: boolean;
  onBudgetMonthlyAlertsChange: (enabled: boolean) => void;
  onBudgetDailyAlertsChange: (enabled: boolean) => void;
  onBudgetCategoryAlertsChange: (enabled: boolean) => void;
  onBudgetMonthlyWarnPctChange: (pct: number) => void;
  onBudgetDailyWarnPctChange: (pct: number) => void;
  onBudgetCategoryWarnPctChange: (pct: number) => void;
  onAutoCaptureAlertsChange: (enabled: boolean) => void;
  onCaptureFailedAlertsChange: (enabled: boolean) => void;
  onClear: () => void;
  onSave: () => void;
  saveLoading?: boolean;
  saveDisabled?: boolean;
  clearDisabled?: boolean;
  /** Incremented on Clear to resync Custom slider UI. */
  draftSyncKey?: number;
};

export const SettingsNotificationsEditor = memo(
  function SettingsNotificationsEditor({
    deviceNotificationsEnabled,
    onDeviceNotificationsChange,
    dailyExpenseReminderEnabled,
    dailyExpenseReminderTime,
    onDailyExpenseReminderEnabledChange,
    onDailyExpenseReminderTimeChange,
    budgetMonthlyAlertsEnabled,
    budgetDailyAlertsEnabled,
    budgetCategoryAlertsEnabled,
    budgetMonthlyWarnPct,
    budgetDailyWarnPct,
    budgetCategoryWarnPct,
    autoCaptureAlertsEnabled,
    captureFailedAlertsEnabled,
    togglesDisabled = false,
    onBudgetMonthlyAlertsChange,
    onBudgetDailyAlertsChange,
    onBudgetCategoryAlertsChange,
    onBudgetMonthlyWarnPctChange,
    onBudgetDailyWarnPctChange,
    onBudgetCategoryWarnPctChange,
    onAutoCaptureAlertsChange,
    onCaptureFailedAlertsChange,
    onClear,
    onSave,
    saveLoading = false,
    saveDisabled = false,
    clearDisabled = false,
    draftSyncKey = 0,
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
          <BudgetAlertScopeBlock
            label="Monthly budget"
            subtitle="Alerts for your monthly spending cap."
            enabled={budgetMonthlyAlertsEnabled}
            warnPct={budgetMonthlyWarnPct}
            syncKey={draftSyncKey}
            disabled={togglesDisabled}
            onEnabledChange={onBudgetMonthlyAlertsChange}
            onWarnPctChange={onBudgetMonthlyWarnPctChange}
            onAnimationBusyChange={onAnimationBusyChange}
            showSeparator
          />
          <BudgetAlertScopeBlock
            label="Daily budget"
            subtitle="Alerts for your daily spending cap."
            enabled={budgetDailyAlertsEnabled}
            warnPct={budgetDailyWarnPct}
            syncKey={draftSyncKey}
            disabled={togglesDisabled}
            onEnabledChange={onBudgetDailyAlertsChange}
            onWarnPctChange={onBudgetDailyWarnPctChange}
            onAnimationBusyChange={onAnimationBusyChange}
            showSeparator
          />
          <BudgetAlertScopeBlock
            label="Category budgets"
            subtitle="Alerts for category monthly caps."
            enabled={budgetCategoryAlertsEnabled}
            warnPct={budgetCategoryWarnPct}
            syncKey={draftSyncKey}
            disabled={togglesDisabled}
            onEnabledChange={onBudgetCategoryAlertsChange}
            onWarnPctChange={onBudgetCategoryWarnPctChange}
            onAnimationBusyChange={onAnimationBusyChange}
          />
        </SettingsFormCard>

        <SettingsFormCard>
          <SettingsToggleRow
            label="Transaction added alerts"
            subtitle="When Dime auto-adds a transaction from SMS, scan, or voice."
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
      </View>
    );
  },
);

const styles = StyleSheet.create({
  root: {
    gap: SETTINGS_SECTION_GAP,
  },
});
