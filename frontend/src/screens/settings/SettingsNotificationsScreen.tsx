import { ActivityIndicator, StyleSheet, View } from "react-native";

import { EmptyState, emptyStateCopy } from "@/components/shared";
import { SettingsNotificationsEditor } from "@/features/settings/components";

import { useSettingsNotificationsScreenModel } from "./useSettingsNotificationsScreenModel";
import { useTheme } from "@/theme";

export default function SettingsNotificationsScreen() {
  const { colors } = useTheme();
  const { isInitialLoading, isError, refetch, editorProps } =
    useSettingsNotificationsScreenModel();

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
