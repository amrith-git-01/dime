import { memo } from "react";
import { StyleSheet, View } from "react-native";

import { BentoEditorFooter } from "@/components/bento";

import { SETTINGS_SECTION_GAP } from "../constants/settingsTokens";
import { useSettingsToggleBusyGate } from "../hooks/useSettingsToggleBusyGate";
import {
  SettingsRemindersCard,
  type SettingsRemindersCardProps,
} from "./SettingsRemindersCard";

export type ReminderSettingsEditorProps = {
  /** When and how early, quiet hours, My UPI ID. */
  reminders: Omit<SettingsRemindersCardProps, "disabled" | "onAnimationBusyChange">;
  togglesDisabled?: boolean;
  onClear: () => void;
  onSave: () => void;
  saveLoading?: boolean;
  saveDisabled?: boolean;
  clearDisabled?: boolean;
};

/** Reminder settings: the Reminders card with its own Save and Clear. */
export const ReminderSettingsEditor = memo(function ReminderSettingsEditor({
  reminders,
  togglesDisabled = false,
  onClear,
  onSave,
  saveLoading = false,
  saveDisabled = false,
  clearDisabled = false,
}: ReminderSettingsEditorProps) {
  const { busy, onAnimationBusyChange, deferDisabled } =
    useSettingsToggleBusyGate();

  return (
    <View style={styles.root}>
      <SettingsRemindersCard
        {...reminders}
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
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    gap: SETTINGS_SECTION_GAP,
  },
});
