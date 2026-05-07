import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { TabScreenShell } from "@/components/layout/TabScreenShell";
import { Button } from "@/components/ui/Button/Button";
import { fontFamilies } from "@/constants/fonts";
import { colors, spacing, typography } from "@/constants/theme";
import { useGemma } from "@/features/ai";
import { useSignOut } from "@/features/auth/hooks/useSignOut";

const SUCCESS_GREEN = "#16A34A";
const DANGER_RED = "#DC2626";

export default function SettingsScreen() {
  const { signOut, loading } = useSignOut();
  const {
    status: gemmaStatus,
    downloadProgress,
    error: gemmaError,
    startDownload,
    retryAfterError,
    promptRaw,
  } = useGemma();
  const [gemmaTestInput, setGemmaTestInput] = useState("");
  const [gemmaTestOutput, setGemmaTestOutput] = useState<string | null>(null);
  const [gemmaTestLoading, setGemmaTestLoading] = useState(false);

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

  const gemmaBody = useMemo(() => {
    switch (gemmaStatus) {
      case "idle":
      case "checking":
        return (
          <View style={styles.gemmaRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.gemmaStatusText}>Checking on-device AI…</Text>
          </View>
        );
      case "needs_download":
        return (
          <>
            <Text style={styles.gemmaDescription}>
              Download the Gemma model once to run receipt scan and
              categorization on your phone. Large download — use Wi‑Fi if
              possible.
            </Text>
            <Button
              title="Download model"
              variant="primary"
              onPress={() => void startDownload()}
            />
          </>
        );
      case "downloading":
        return (
          <View style={styles.gemmaRow}>
            <ActivityIndicator color={colors.primary} />
            <View style={styles.gemmaProgressCol}>
              <Text style={styles.gemmaStatusText}>Downloading model…</Text>
              <Text style={styles.gemmaProgressMono}>{downloadProgress}%</Text>
            </View>
          </View>
        );
      case "initializing":
      case "needs_init":
        return (
          <View style={styles.gemmaRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.gemmaStatusText}>Loading model…</Text>
          </View>
        );
      case "ready":
        return (
          <>
            <Text style={styles.gemmaReadyText}>On-device AI is ready.</Text>

            <View style={styles.gemmaTestWrap}>
              <Text style={styles.gemmaTestTitle}>Test prompt</Text>
              <TextInput
                value={gemmaTestInput}
                onChangeText={(t) => setGemmaTestInput(t)}
                placeholder="Type prompt and press Send…"
                placeholderTextColor={colors.textSecondary}
                style={styles.gemmaInput}
                returnKeyType="send"
                blurOnSubmit={true}
                onSubmitEditing={() => {
                  const prompt = gemmaTestInput.trim();
                  if (prompt.length === 0 || gemmaTestLoading) {
                    return;
                  }
                  setGemmaTestLoading(true);
                  setGemmaTestOutput(null);
                  void (async () => {
                    const out = await promptRaw(prompt);
                    setGemmaTestOutput(out ?? "(no response)");
                    setGemmaTestLoading(false);
                  })();
                }}
              />

              {gemmaTestLoading ? (
                <View style={styles.gemmaRow}>
                  <ActivityIndicator color={colors.primary} />
                  <Text style={styles.gemmaStatusText}>Thinking…</Text>
                </View>
              ) : gemmaTestOutput ? (
                <View style={styles.gemmaOutputBox}>
                  <Text selectable style={styles.gemmaOutputText}>
                    {gemmaTestOutput}
                  </Text>
                </View>
              ) : null}
            </View>
          </>
        );
      case "error":
        return (
          <>
            <Text style={styles.gemmaErrorText}>
              {gemmaError ?? "Something went wrong."}
            </Text>
            <Button
              title="Try again"
              variant="secondary"
              onPress={() => void retryAfterError()}
            />
          </>
        );
      default:
        return null;
    }
  }, [
    gemmaStatus,
    downloadProgress,
    gemmaError,
    startDownload,
    retryAfterError,
    promptRaw,
    gemmaTestInput,
    gemmaTestLoading,
    gemmaTestOutput,
  ]);

  return (
    <TabScreenShell>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.subtitle}>
          Account, security, and preferences go here.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>On-device AI</Text>
          <Text style={styles.cardSubtitle}>
            Gemma runs offline after setup. No cloud inference for these
            features.
          </Text>
          {gemmaBody}
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
      </ScrollView>
    </TabScreenShell>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl * 2,
  },
  subtitle: {
    ...typography.screenSubtitle,
    marginTop: spacing.xs,
  },
  card: {
    marginTop: spacing.xl,
    padding: spacing.lg,
    backgroundColor: colors.barBackground,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  cardTitle: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 18,
    lineHeight: 24,
    color: colors.textPrimary,
  },
  cardSubtitle: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  gemmaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  gemmaProgressCol: {
    flex: 1,
    gap: spacing.xs,
  },
  gemmaStatusText: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textPrimary,
    flex: 1,
  },
  gemmaDescription: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  gemmaProgressMono: {
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 16,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  gemmaReadyText: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: SUCCESS_GREEN,
  },
  gemmaErrorText: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: DANGER_RED,
  },
  gemmaTestWrap: {
    gap: spacing.xs,
  },
  gemmaTestTitle: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textPrimary,
  },
  gemmaInput: {
    minHeight: 52,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#FFFFFF",
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textPrimary,
  },
  gemmaOutputBox: {
    width: "100%",
    padding: spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#FFFFFF",
  },
  gemmaOutputText: {
    flexShrink: 1,
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textPrimary,
  },
  logoutWrap: {
    marginTop: spacing.xl,
  },
});
