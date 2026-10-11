import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useMemo, useState } from "react";
import { BackHandler } from "react-native";

import { useConfirmSignOut } from "@/features/auth/hooks/useConfirmSignOut";
import { useSaveProfileMutation } from "@/features/profile/hooks/useSaveProfileMutation";
import { useProfileSetup } from "@/hooks/useProfileSetup";
import { parseFastApiError } from "@/lib/api/parseFastApiError";
import { uploadProfileAvatarFromUrl } from "@/lib/api/uploadProfileAvatar";

export function useProfileSetupScreenModel() {
  const { avatarUrl, refreshAvatarSeed, username, setUsername, validation } =
    useProfileSetup();
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarUploadError, setAvatarUploadError] = useState<string | null>(
    null,
  );

  const saveProfileMutation = useSaveProfileMutation();
  const { confirmSignOut, signOutLoading, signOutConfirmModalProps } =
    useConfirmSignOut();

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        () => {
          confirmSignOut();
          return true;
        },
      );
      return () => subscription.remove();
    }, [confirmSignOut]),
  );

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
    } catch (error) {
      setAvatarUploadError(parseFastApiError(error));
    } finally {
      setUploadingAvatar(false);
    }
  }, [avatarUrl, saveProfileMutation, username]);

  const fieldError = useMemo(() => {
    if (avatarUploadError) {
      return avatarUploadError;
    }
    if (saveProfileMutation.error) {
      return parseFastApiError(saveProfileMutation.error);
    }
    return null;
  }, [avatarUploadError, saveProfileMutation.error]);

  const busy =
    saveProfileMutation.isPending || uploadingAvatar || signOutLoading;

  const saving = saveProfileMutation.isPending || uploadingAvatar;

  return {
    avatarUrl,
    username,
    validation,
    fieldError,
    disabled: busy,
    continueLoading: saving,
    continueDisabled: busy || !validation.isValid,
    signOutLoading,
    signOutDisabled: saving,
    signOutConfirmModalProps,
    onUsernameChange: handleUsernameChange,
    onRefreshRandom: refreshAvatarSeed,
    onContinue: () => void handleContinue(),
    onSignOut: confirmSignOut,
  };
}
