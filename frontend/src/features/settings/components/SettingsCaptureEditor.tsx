import { memo } from "react";
import { Linking, Pressable, StyleSheet, Text } from "react-native";

import { inkSoft, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";

import { useSettingsToggleBusyGate } from "../hooks/useSettingsToggleBusyGate";
import { SettingsEditorFooter } from "./SettingsEditorFooter";
import { SettingsFormCard } from "./SettingsFormCard";
import { SettingsToggleRow } from "./SettingsToggleRow";

export type SettingsCaptureEditorProps = {
  smsScanEnabled: boolean;
  onSmsScanChange: (enabled: boolean) => void;
  showOpenSettings?: boolean;
  togglesDisabled?: boolean;
  onClear: () => void;
  onSave: () => void;
  saveLoading?: boolean;
  saveDisabled?: boolean;
  clearDisabled?: boolean;
};

export const SettingsCaptureEditor = memo(function SettingsCaptureEditor({
  smsScanEnabled,
  onSmsScanChange,
  showOpenSettings = false,
  togglesDisabled = false,
  onClear,
  onSave,
  saveLoading = false,
  saveDisabled = false,
  clearDisabled = false,
}: SettingsCaptureEditorProps) {
  const { busy, onAnimationBusyChange, deferDisabled } =
    useSettingsToggleBusyGate();

  return (
    <SettingsFormCard>
      <SettingsToggleRow
        label="Scan bank SMS on open"
        subtitle="When you open Dime, review new bank messages before they are logged."
        value={smsScanEnabled}
        onValueChange={onSmsScanChange}
        disabled={togglesDisabled}
        onAnimationBusyChange={onAnimationBusyChange}
      />
      {showOpenSettings ? (
        <Pressable
          onPress={() => {
            void Linking.openSettings();
          }}
          accessibilityRole="button"
          accessibilityLabel="Open system settings"
          style={styles.settingsLink}
        >
          <Text style={styles.settingsLinkText}>
            SMS permission is blocked. Open system settings to allow it.
          </Text>
        </Pressable>
      ) : null}

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

const styles = StyleSheet.create({
  settingsLink: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  settingsLinkText: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    color: inkSoft,
  },
});
