import { memo } from "react";

import { BentoEditorFooter } from "@/components/bento";
import {
  SettingsFormCard,
  SettingsOptionRow,
  SettingsToggleRow,
} from "@/features/settings/components";
import { useSettingsToggleBusyGate } from "@/features/settings/hooks/useSettingsToggleBusyGate";
import {
  REPORT_ROAST_LEVELS,
  type ReportRoastLevel,
} from "@/features/settings/types";

export type ReportSettingsEditorProps = {
  reportAlertsEnabled: boolean;
  reportRoastLevel: ReportRoastLevel;
  togglesDisabled?: boolean;
  onReportAlertsChange: (enabled: boolean) => void;
  onReportRoastLevelChange: (level: ReportRoastLevel) => void;
  onClear: () => void;
  onSave: () => void;
  saveLoading?: boolean;
  saveDisabled?: boolean;
  clearDisabled?: boolean;
};

const ROAST_LEVEL_COPY: Readonly<
  Record<ReportRoastLevel, { label: string; subtitle: string }>
> = {
  gentle: { label: "Gentle", subtitle: "Kind and encouraging" },
  spicy: { label: "Spicy", subtitle: "Light teasing (default)" },
  savage: { label: "Savage", subtitle: "No mercy" },
};

/**
 * Broke Reports: the monthly push and the roast level (which also sets the tone of reminder
 * nudges), with their own Save and Clear.
 */
export const ReportSettingsEditor = memo(function ReportSettingsEditor({
  reportAlertsEnabled,
  reportRoastLevel,
  togglesDisabled = false,
  onReportAlertsChange,
  onReportRoastLevelChange,
  onClear,
  onSave,
  saveLoading = false,
  saveDisabled = false,
  clearDisabled = false,
}: ReportSettingsEditorProps) {
  const { busy, onAnimationBusyChange, deferDisabled } =
    useSettingsToggleBusyGate();

  return (
    <SettingsFormCard
      title="Report settings"
      subtitle="Your month in review, with attitude. The roast level also sets the tone of your reminder nudges."
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
          onPress={() => {
            if (!togglesDisabled) {
              onReportRoastLevelChange(level);
            }
          }}
          showSeparator={index < REPORT_ROAST_LEVELS.length - 1}
        />
      ))}

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
