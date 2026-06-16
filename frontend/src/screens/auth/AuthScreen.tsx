import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  BENTO_FORM_BODY_GAP,
  BENTO_FORM_SECTION_PADDING,
} from "@/components/bento";
import { StackScreenShell } from "@/components/layout/StackScreenShell";
import { TwoToneCard } from "@/components/shared";
import { bento, colors, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";

import { useAuthScreenModel } from "./useAuthScreenModel";

export default function AuthScreen() {
  const model = useAuthScreenModel();

  return (
    <StackScreenShell contentContainerStyle={styles.shellContent}>
      <TwoToneCard
        header={
          <View style={styles.headerInner}>
            <Text style={styles.headerTitle}>Welcome to Dime</Text>
            <Text style={styles.headerSubtitle}>
              Sign in to track spending and stay on budget.
            </Text>
          </View>
        }
        body={
          <View style={styles.bodyInner}>
            {model.googleError ? (
              <Text style={styles.errorText}>{model.googleError}</Text>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Continue with Google"
              disabled={model.busy}
              onPress={model.submitGoogle}
              style={({ pressed }) => [
                styles.googleButton,
                pressed && !model.busy && styles.googleButtonPressed,
                model.busy && styles.googleButtonDisabled,
              ]}
            >
              {model.googleLoading ? (
                <ActivityIndicator size="small" color={colors.oauthGoogle} />
              ) : (
                <MaterialCommunityIcons
                  name="google"
                  size={22}
                  color={colors.oauthGoogle}
                />
              )}
              <Text style={styles.googleLabel}>
                {model.googleLoading ? "Signing in…" : "Continue with Google"}
              </Text>
            </Pressable>

            <Text style={styles.legal}>
              By continuing you agree to our Terms and Privacy Policy.
            </Text>
          </View>
        }
      />
    </StackScreenShell>
  );
}

const styles = StyleSheet.create({
  shellContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
  headerInner: {
    padding: BENTO_FORM_SECTION_PADDING,
    gap: spacing.sm,
  },
  headerTitle: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 18,
    lineHeight: 24,
    color: bento.onPastel.primary,
  },
  headerSubtitle: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: bento.onPastel.muted,
  },
  bodyInner: {
    padding: BENTO_FORM_SECTION_PADDING,
    gap: BENTO_FORM_BODY_GAP,
  },
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.barBackground,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  googleButtonPressed: {
    opacity: 0.88,
  },
  googleButtonDisabled: {
    opacity: 0.55,
  },
  googleLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 16,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  errorText: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.error,
    textAlign: "center",
  },
  legal: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textSecondary,
    textAlign: "center",
  },
});
