import { useCallback } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";

import { TabScreenShell } from "@/components/layout/TabScreenShell";
import { Button } from "@/components/ui/Button/Button";
import { colors, spacing, typography } from "@/constants/theme";
import { useSignOut } from "@/features/auth/hooks/useSignOut";

export default function SettingsScreen() {
  const { signOut, loading } = useSignOut();

  const performLogout = useCallback(async () => {
    try {
      await signOut();
    } catch (e) {
      console.warn("[Settings] logout failed", e);
      Alert.alert(
        "Couldn’t sign out",
        e instanceof Error ? e.message : "Try again.",
      );
    }
  }, [signOut]);

  const confirmLogout = useCallback(() => {
    Alert.alert("Sign out?", "You’ll need to sign in again to use the app.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: () => void performLogout(),
      },
    ]);
  }, [performLogout]);

  return (
    <TabScreenShell>
      <View style={styles.body}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>
          Account, security, and preferences go here.
        </Text>

        <View style={styles.logoutWrap}>
          <Button
            title="Sign out"
            variant="secondary"
            loading={loading}
            disabled={loading}
            onPress={confirmLogout}
          />
        </View>
      </View>
    </TabScreenShell>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  title: {
    ...typography.screenTitle,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.screenSubtitle,
    marginTop: spacing.sm,
  },
  logoutWrap: {
    marginTop: spacing.xl,
  },
});
