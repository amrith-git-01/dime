import { useCallback } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui/Button/Button";
import { layout, spacing, typography } from "@/constants/theme";
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
    <>
      <Text style={styles.subtitle}>
        Account, security, and preferences go here.
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>AI processing</Text>
        <Text style={styles.cardSubtitle}>
          Receipt parsing now runs through secure cloud APIs via backend. Camera
          upload sends only the captured receipt image for extraction.
        </Text>
      </View>

      <View style={styles.logoutWrap}>
        <Button
          title="Sign out"
          variant="secondary"
          loading={loading}
          disabled={loading}
          onPress={confirmLogout}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    ...typography.screenSubtitle,
    marginTop: spacing.xs,
  },
  card: {
    ...layout.cardCompact,
    marginTop: spacing.xl,
    gap: spacing.md,
  },
  cardTitle: typography.cardTitle,
  cardSubtitle: typography.cardBody,
  logoutWrap: {
    marginTop: spacing.xl,
  },
});
