import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { HorizontalSlidePanel } from "@/components/animations/HorizontalSlidePanel";
import { Button, TextField } from "@/components/ui";
import { colors, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { AuthScreenLayout } from "@/components/auth/AuthScreenLayout";

import { useAuthScreenModel } from "./useAuthScreenModel";

export default function AuthScreen() {
  const model = useAuthScreenModel();

  return (
    <AuthScreenLayout mode={model.mode} onModeChange={model.setMode}>
      <View style={styles.slideRoot}>
        {model.mode === "login" ? (
          <HorizontalSlidePanel panelKey="auth-login" preset="fromStart">
            <View style={styles.formCard}>
              <TextField
                label="Email"
                value={model.email}
                onChangeText={model.updateEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="emailAddress"
                editable={!model.busy}
              />
              <TextField
                label="Password"
                value={model.password}
                onChangeText={model.updatePassword}
                showPasswordToggle
                showClear={false}
                textContentType="password"
                editable={!model.busy}
              />
              {model.loginBanner ? (
                <Text style={styles.bannerError}>{model.loginBanner}</Text>
              ) : null}

              <Button
                title="Sign in"
                loading={model.signInLoading}
                disabled={model.busy}
                onPress={model.submitSignIn}
              />

              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>

              <PressableGoogleRow
                disabled={model.busy}
                loading={model.googleLoading}
                onPress={model.submitGoogle}
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
                value={model.email}
                onChangeText={model.updateEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="emailAddress"
                editable={!model.busy}
              />
              <TextField
                label="Password"
                value={model.password}
                onChangeText={model.updatePassword}
                showPasswordToggle
                showClear={false}
                textContentType="newPassword"
                editable={!model.busy}
              />
              <TextField
                label="Confirm password"
                value={model.passwordConfirm}
                onChangeText={model.updatePasswordConfirm}
                showPasswordToggle
                showClear={false}
                textContentType="newPassword"
                editable={!model.busy}
              />
              {model.registerBanner ? (
                <Text style={styles.bannerError}>{model.registerBanner}</Text>
              ) : null}

              <Button
                title="Create account"
                loading={model.signUpLoading}
                disabled={model.busy}
                onPress={model.submitSignUp}
              />

              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>

              <PressableGoogleRow
                disabled={model.busy}
                loading={model.googleLoading}
                onPress={model.submitGoogle}
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
        {loading ? "Opening Google..." : "Continue with Google"}
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
