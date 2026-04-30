import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { HorizontalSlidePanel } from "@/components/animations/HorizontalSlidePanel";
import { Button } from "@/components/ui/Button/Button";
import { TextField } from "@/components/ui/TextField/TextField";
import { colors, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { AuthScreenLayout } from "@/components/auth/AuthScreenLayout";
import { useEmailPasswordSignIn } from "@/features/auth/hooks/useEmailPasswordSignIn";
import { useEmailPasswordSignUp } from "@/features/auth/hooks/useEmailPasswordSignUp";
import { useGoogleSignIn } from "@/features/auth/hooks/useGoogleSignIn";

export default function AuthScreen() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");

  const signIn = useEmailPasswordSignIn();
  const signUp = useEmailPasswordSignUp();
  const google = useGoogleSignIn();

  const clearAuthErrors = useCallback(() => {
    signIn.setError(null);
    signUp.setError(null);
    google.setError(null);
  }, [signIn.setError, signUp.setError, google.setError]);

  const isFirstModeMount = useRef(true);
  useEffect(() => {
    if (isFirstModeMount.current) {
      isFirstModeMount.current = false;
      return;
    }
    setEmail("");
    setPassword("");
    setPasswordConfirm("");
    clearAuthErrors();
  }, [mode, clearAuthErrors]);

  const busy = signIn.loading || signUp.loading || google.loading;
  const loginBanner = signIn.error ?? google.error;
  const registerBanner = signUp.error ?? google.error;

  return (
    <AuthScreenLayout mode={mode} onModeChange={setMode}>
      <View style={styles.slideRoot}>
        {mode === "login" ? (
          <HorizontalSlidePanel panelKey="auth-login" preset="fromStart">
            <View style={styles.formCard}>
              <TextField
                label="Email"
                value={email}
                onChangeText={(v) => {
                  setEmail(v);
                  clearAuthErrors();
                }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="emailAddress"
                editable={!busy}
              />
              <TextField
                label="Password"
                value={password}
                onChangeText={(v) => {
                  setPassword(v);
                  clearAuthErrors();
                }}
                showPasswordToggle
                showClear={false}
                textContentType="password"
                editable={!busy}
              />
              {loginBanner ? (
                <Text style={styles.bannerError}>{loginBanner}</Text>
              ) : null}

              <Button
                title="Sign in"
                loading={signIn.loading}
                disabled={busy}
                onPress={() => {
                  void signIn.signIn(email, password);
                }}
              />

              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>

              <PressableGoogleRow
                disabled={busy}
                loading={google.loading}
                onPress={() => void google.signInWithGoogle()}
              />

              <Text style={styles.legal}>
                By continuing you agree to our Terms and Privacy Policy.
              </Text>
            </View>
          </HorizontalSlidePanel>
        ) : (
          <HorizontalSlidePanel panelKey="auth-register" preset="fromEnd">
            <View style={styles.formCard}>
              <TextField
                label="Email"
                value={email}
                onChangeText={(v) => {
                  setEmail(v);
                  clearAuthErrors();
                }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="emailAddress"
                editable={!busy}
              />
              <TextField
                label="Password"
                value={password}
                onChangeText={(v) => {
                  setPassword(v);
                  clearAuthErrors();
                }}
                showPasswordToggle
                showClear={false}
                textContentType="newPassword"
                editable={!busy}
              />
              <TextField
                label="Confirm password"
                value={passwordConfirm}
                onChangeText={(v) => {
                  setPasswordConfirm(v);
                  clearAuthErrors();
                }}
                showPasswordToggle
                showClear={false}
                textContentType="newPassword"
                editable={!busy}
              />
              {registerBanner ? (
                <Text style={styles.bannerError}>{registerBanner}</Text>
              ) : null}

              <Button
                title="Create account"
                loading={signUp.loading}
                disabled={busy}
                onPress={() => {
                  void signUp.signUp(email, password, passwordConfirm);
                }}
              />

              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>

              <PressableGoogleRow
                disabled={busy}
                loading={google.loading}
                onPress={() => void google.signInWithGoogle()}
              />

              <Text style={styles.legal}>
                By continuing you agree to our Terms and Privacy Policy.
              </Text>
            </View>
          </HorizontalSlidePanel>
        )}
      </View>
    </AuthScreenLayout>
  );
}

function PressableGoogleRow({
  disabled,
  loading,
  onPress,
}: {
  disabled: boolean;
  loading: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 48,
        borderRadius: 12,
        paddingHorizontal: spacing.lg,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: spacing.sm,
        backgroundColor: colors.barBackground,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
        opacity: pressed && !disabled ? 0.9 : 1,
      })}
    >
      <MaterialCommunityIcons
        name="google"
        size={22}
        color={colors.oauthGoogle}
      />
      <Text style={styles.googleLabel}>
        {loading ? "Opening Google…" : "Continue with Google"}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  slideRoot: {
    width: "100%",
  },
  formCard: {
    backgroundColor: colors.barBackground,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    rowGap: spacing.lg,
  },
  bannerError: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.error,
    textAlign: "center",
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  dividerText: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.inactive,
  },
  googleLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 16,
    lineHeight: 22,
    color: colors.primary,
  },
  legal: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textSecondary,
    textAlign: "center",
  },
});
