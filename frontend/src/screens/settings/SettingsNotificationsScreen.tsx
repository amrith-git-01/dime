import { ActivityIndicator, StyleSheet, View } from "react-native";

import { EmptyState, emptyStateCopy } from "@/components/shared";
import { colors } from "@/constants";
import { SettingsNotificationsEditor } from "@/features/settings/components";

import { useSettingsNotificationsScreenModel } from "./useSettingsNotificationsScreenModel";

export default function SettingsNotificationsScreen() {
  const { isInitialLoading, isError, refetch, editorProps } =
    useSettingsNotificationsScreenModel();

  if (isInitialLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (isError) {
    return (
      <EmptyState
        layout="centered"
        headline={emptyStateCopy.notificationsError.headline}
        subtext={emptyStateCopy.notificationsError.subtext}
        actionLabel="Try again"
        onAction={() => void refetch()}
      />
    );
  }

  return <SettingsNotificationsEditor {...editorProps} />;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
  },
});
