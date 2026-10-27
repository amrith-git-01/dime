import { memo } from "react";
import { StyleSheet, View } from "react-native";

import { SETTINGS_SECTION_GAP } from "../constants/settingsTokens";
import { useSettingsToggleBusyGate } from "../hooks/useSettingsToggleBusyGate";
import { BudgetAlertScopeBlock } from "./BudgetAlertScopeBlock";
import { DailyExpenseReminderSection } from "./DailyExpenseReminderSection";
import { DeviceNotificationsSection } from "./DeviceNotificationsSection";
import { BentoEditorFooter } from "@/components/bento";
import { SettingsFormCard } from "./SettingsFormCard";
import { SettingsOptionRow } from "./SettingsOptionRow";
import { SettingsToggleRow } from "./SettingsToggleRow";
import { REPORT_ROAST_LEVELS, type ReportRoastLevel } from "../types";

export type SettingsNotificationsEditorProps = {
  deviceNotificationsEnabled: boolean;
  onDeviceNotificationsChange: (enabled: boolean) => void;
  dailyExpenseReminderEnabled: boolean;
  dailyExpenseReminderTime: string;
  onDailyExpenseReminderEnabledChange: (enabled: boolean) => void;
  onDailyExpenseReminderTimeChange: (time: string) => void;
  budgetMonthlyAlertsEnabled: boolean;
  budgetCategoryAlertsEnabled: boolean;
  budgetMonthlyWarnPct: number;
  budgetCategoryWarnPct: number;
  autoCaptureAlertsEnabled: boolean;
  captureFailedAlertsEnabled: boolean;
  reportAlertsEnabled: boolean;
  reportRoastLevel: ReportRoastLevel;
  onReportAlertsChange: (enabled: boolean) => void;
  onReportRoastLevelChange: (level: ReportRoastLevel) => void;
  togglesDisabled?: boolean;
  onBudgetMonthlyAlertsChange: (enabled: boolean) => void;
  onBudgetCategoryAlertsChange: (enabled: boolean) => void;
  onBudgetMonthlyWarnPctChange: (pct: number) => void;
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

const ROAST_LEVEL_COPY: Readonly<
  Record<ReportRoastLevel, { label: string; subtitle: string }>
> = {
  gentle: { label: "Gentle", subtitle: "Kind and encouraging" },
  spicy: { label: "Spicy", subtitle: "Light teasing (default)" },
  savage: { label: "Savage", subtitle: "No mercy" },
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
    budgetCategoryAlertsEnabled,
    budgetMonthlyWarnPct,
    budgetCategoryWarnPct,
    autoCaptureAlertsEnabled,
    captureFailedAlertsEnabled,
    reportAlertsEnabled,
    reportRoastLevel,
    onReportAlertsChange,
    onReportRoastLevelChange,
    togglesDisabled = false,
    onBudgetMonthlyAlertsChange,
    onBudgetCategoryAlertsChange,
    onBudgetMonthlyWarnPctChange,
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

        <SettingsFormCard
          title="Broke Report"
          subtitle="Your month in review, with attitude."
        >
          <SettingsToggleRow
            label="Monthly Broke Report"
            subtitle="A push when your report is ready"
            value={reportAlertsEnabled}
            onValueChange={onReportAlertsChange}
            disabled={togglesDisabled}
            onAnimationBusyChange={onAnimationBusyChange}
            showSeparator
          />
          {REPORT_ROAST_LEVELS.map((level, index) => (
            <SettingsOptionRow
              key={level}
              label={ROAST_LEVEL_COPY[level].label}
              subtitle={ROAST_LEVEL_COPY[level].subtitle}
              selected={reportRoastLevel === level}
              onPress={() => onReportRoastLevelChange(level)}
              showSeparator={index < REPORT_ROAST_LEVELS.length - 1}
            />
          ))}
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
