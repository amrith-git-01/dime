import { Image } from "expo-image";
import { RefreshCw } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { ScreenContainer } from "@/components/layout/ScreenContainer";
import { Button } from "@/components/ui/Button/Button";
import { TextField } from "@/components/ui/TextField/TextField";
import { fontFamilies } from "@/constants/fonts";
import { colors, spacing } from "@/constants/theme";
import { useSaveProfileMutation } from "@/features/profile/hooks/useSaveProfileMutation";
import { useProfileSetup } from "@/hooks/useProfileSetup";
import { parseFastApiError } from "@/lib/api/parseFastApiError";
import { uploadProfileAvatarFromUrl } from "@/lib/api/uploadProfileAvatar";
import { triggerMediumHaptic } from "@/lib/haptics/nativeHaptics";

export type ProfileSetupScreenProps = {
  onProfileComplete: () => void;
};

const AVATAR_SIZE = 120;
const STAGE_PAD = 20;

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

  const avatarRotation = useSharedValue(0);
  const avatarScale = useSharedValue(1);

  const avatarAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${avatarRotation.value}deg` },
      { scale: avatarScale.value },
    ],
  }));

  const runRefreshFeedback = useCallback(() => {
    avatarScale.value = withSequence(
      withSpring(0.94, { damping: 18, stiffness: 320 }),
      withSpring(1.04, { damping: 14, stiffness: 240 }),
      withSpring(1, { damping: 16, stiffness: 220 }),
    );
    avatarRotation.value = 0;
    avatarRotation.value = withTiming(360, { duration: 420 }, (finished) => {
      if (finished) {
        avatarRotation.value = 0;
      }
    });
  }, [avatarRotation, avatarScale]);

  const handleRefreshAvatar = useCallback(() => {
    void triggerMediumHaptic();
    refreshAvatarSeed();
    runRefreshFeedback();
  }, [refreshAvatarSeed, runRefreshFeedback]);

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
        keyboardDismissMode="on-drag"
        bottomOffset={24}
      >
        <View style={styles.column}>
          <View style={styles.hero}>
            <Text style={styles.title}>Almost there</Text>
            <Text style={styles.subtitle}>
              Pick a generated avatar and a username.
            </Text>
          </View>

          <View style={styles.avatarStage}>
            <Animated.View style={[styles.avatarRing, avatarAnimatedStyle]}>
              <Image
                source={{ uri: avatarUrl }}
                style={styles.avatarImage}
                contentFit="cover"
                accessibilityLabel="Avatar preview"
              />
            </Animated.View>

            <View style={styles.refreshFabWrap} pointerEvents="box-none">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="New random avatar"
                hitSlop={10}
                disabled={saveProfileMutation.isPending || uploadingAvatar}
                onPress={handleRefreshAvatar}
                style={({ pressed }) => [
                  styles.refreshFab,
                  pressed && !saveProfileMutation.isPending && !uploadingAvatar
                    ? styles.refreshFabPressed
                    : null,
                  saveProfileMutation.isPending || uploadingAvatar
                    ? styles.refreshFabDisabled
                    : null,
                ]}
              >
                <RefreshCw size={18} color={colors.primary} strokeWidth={2} />
              </Pressable>
            </View>
          </View>

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
  avatarStage: {
    width: AVATAR_SIZE + STAGE_PAD * 2,
    height: AVATAR_SIZE + STAGE_PAD * 2,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  avatarRing: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.barBackground,
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  refreshFabWrap: {
    position: "absolute",
    right: spacing.xs,
    bottom: spacing.xs,
  },
  refreshFab: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.barBackground,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  refreshFabPressed: {
    opacity: 0.92,
  },
  refreshFabDisabled: {
    opacity: 0.45,
  },
  fieldBlock: {
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
