import { ActivityIndicator, StyleSheet, View } from "react-native";

import { EmptyState, emptyStateCopy } from "@/components/shared";
import { ReminderSettingsEditor } from "@/features/settings/components";
import { useTheme } from "@/theme";

import { useReminderSettingsScreenModel } from "./useReminderSettingsScreenModel";

/** Reminder settings: when reminders fire, quiet hours and My UPI ID. */
export default function ReminderSettingsScreen() {
  const { colors } = useTheme();
  const { isInitialLoading, isError, refetch, editorProps } =
    useReminderSettingsScreenModel();

  if (isInitialLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accentText} />
      </View>
    );
  }

  if (isError) {
    return (
      <EmptyState
        layout="centered"
        headline={emptyStateCopy.remindersError.headline}
        subtext={emptyStateCopy.remindersError.subtext}
        actionLabel="Try again"
        onAction={() => void refetch()}
      />
    );
  }

  return <ReminderSettingsEditor {...editorProps} />;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
  },
});
