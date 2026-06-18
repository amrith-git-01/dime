import { memo } from "react";
import { Linking, Pressable, StyleSheet, Text } from "react-native";

import { inkSoft, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";

import { SettingsFormCard } from "./SettingsFormCard";
import { SettingsToggleRow } from "./SettingsToggleRow";

export type SettingsCaptureEditorProps = {
  smsScanEnabled: boolean;
  onSmsScanChange: (enabled: boolean) => void;
  showOpenSettings?: boolean;
};

export const SettingsCaptureEditor = memo(function SettingsCaptureEditor({
  smsScanEnabled,
  onSmsScanChange,
  showOpenSettings = false,
}: SettingsCaptureEditorProps) {
  return (
    <SettingsFormCard>
      <SettingsToggleRow
        label="Scan bank SMS on open"
        subtitle="When you open Dime, review new bank messages before they are logged."
        value={smsScanEnabled}
        onValueChange={onSmsScanChange}
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
