import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { ScreenContainer } from "@/components/layout/ScreenContainer";
import { ProfileAvatarEditor } from "@/components/profile/ProfileAvatarEditor";
import { Button } from "@/components/ui/Button/Button";
import { TextField } from "@/components/ui/TextField/TextField";
import { fontFamilies } from "@/constants/fonts";
import { colors, spacing } from "@/constants/theme";
import { useSaveProfileMutation } from "@/features/profile/hooks/useSaveProfileMutation";
import { useProfileSetup } from "@/hooks/useProfileSetup";
import { parseFastApiError } from "@/lib/api/parseFastApiError";
import { uploadProfileAvatarFromUrl } from "@/lib/api/uploadProfileAvatar";

export type ProfileSetupScreenProps = {
  onProfileComplete: () => void;
};

const PROFILE_SETUP_AVATAR_SIZE = 120;

export default function ProfileSetupScreen({
  onProfileComplete,
}: ProfileSetupScreenProps) {
  const { avatarUrl, refreshAvatarSeed, username, setUsername, validation } =
    useProfileSetup();
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarUploadError, setAvatarUploadError] = useState<string | null>(
    null,
  );

  const saveProfileMutation = useSaveProfileMutation();

  const handleUsernameChange = useCallback(
    (text: string) => {
      setUsername(text);
      saveProfileMutation.reset();
      setAvatarUploadError(null);
    },
    [saveProfileMutation, setUsername],
  );

  const handleContinue = useCallback(async () => {
    try {
      setAvatarUploadError(null);
      setUploadingAvatar(true);
      const { avatar_url: uploadedAvatarUrl } =
        await uploadProfileAvatarFromUrl(avatarUrl);
      await saveProfileMutation.mutateAsync({
        username: username.trim(),
        currency: "INR",
        avatarUrl: uploadedAvatarUrl,
      });
      onProfileComplete();
    } catch (error) {
      // `saveProfileMutation.error` drives `fieldError` below
      setAvatarUploadError(parseFastApiError(error));
    } finally {
      setUploadingAvatar(false);
    }
  }, [avatarUrl, onProfileComplete, saveProfileMutation, username]);

  const usernameCountLabel = useMemo(
    () => <Text style={styles.charCount}>{username.trim().length}/20</Text>,
    [username],
  );

  const fieldError = useMemo(() => {
    if (avatarUploadError) {
      return avatarUploadError;
    }
    if (saveProfileMutation.error) {
      return parseFastApiError(saveProfileMutation.error);
    }
    return null;
  }, [avatarUploadError, saveProfileMutation.error]);

  return (
    <ScreenContainer>
      <KeyboardAwareScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="none"
        bottomOffset={24}
      >
        <View style={styles.column}>
          <View style={styles.hero}>
            <Text style={styles.title}>Almost there</Text>
            <Text style={styles.subtitle}>
              Pick a generated avatar and a username.
            </Text>
          </View>

          <ProfileAvatarEditor
            avatarUrl={avatarUrl}
            avatarSize={PROFILE_SETUP_AVATAR_SIZE}
            disabled={saveProfileMutation.isPending || uploadingAvatar}
            onRefreshRandom={refreshAvatarSeed}
            hint={null}
          />

          <View style={styles.fieldBlock}>
            <TextField
              label="Username"
              labelRight={usernameCountLabel}
              value={username}
              onChangeText={handleUsernameChange}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!saveProfileMutation.isPending && !uploadingAvatar}
              showClear
              errorMessage={fieldError}
            />
            {!fieldError ? (
              <Text
                style={[
                  styles.hint,
                  validation.isValid ? styles.hintOk : styles.hintMuted,
                ]}
              >
                {validation.message}
              </Text>
            ) : null}
          </View>

          <View style={styles.footer}>
            <Button
              title="Continue"
              loading={saveProfileMutation.isPending || uploadingAvatar}
              disabled={
                saveProfileMutation.isPending ||
                uploadingAvatar ||
                !validation.isValid
              }
              onPress={() => void handleContinue()}
            />
          </View>
        </View>
      </KeyboardAwareScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  column: {
    width: "100%",
    alignItems: "stretch",
  },
  hero: {
    marginBottom: spacing.lg,
    alignSelf: "stretch",
  },
  title: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.2,
    color: colors.textPrimary,
    textAlign: "left",
  },
  subtitle: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: "left",
  },
  fieldBlock: {
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  charCount: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textSecondary,
  },
  hint: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    marginTop: spacing.xs,
  },
  hintMuted: {
    color: colors.textSecondary,
  },
  hintOk: {
    color: colors.primary,
  },
  footer: {
    marginTop: spacing.xs,
  },
});
