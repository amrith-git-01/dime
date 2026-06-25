import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useMemo, useState } from "react";
import { BackHandler } from "react-native";

import { StackScreenShell } from "@/components/layout/StackScreenShell";
import { ConfirmModal } from "@/components/shared";
import { useConfirmSignOut } from "@/features/auth/hooks/useConfirmSignOut";
import { ProfileSetupEditor } from "@/features/profile/components";
import { useSaveProfileMutation } from "@/features/profile/hooks/useSaveProfileMutation";
import { useProfileSetup } from "@/hooks/useProfileSetup";
import { parseFastApiError } from "@/lib/api/parseFastApiError";
import { uploadProfileAvatarFromUrl } from "@/lib/api/uploadProfileAvatar";

export default function ProfileSetupScreen() {
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

  return (
    <StackScreenShell contentContainerStyle={shellContentStyle}>
      <ProfileSetupEditor
        avatarUrl={avatarUrl}
        username={username}
        validation={validation}
        fieldError={fieldError}
        disabled={busy}
        continueLoading={saveProfileMutation.isPending || uploadingAvatar}
        continueDisabled={busy || !validation.isValid}
        signOutLoading={signOutLoading}
        signOutDisabled={saveProfileMutation.isPending || uploadingAvatar}
        onUsernameChange={handleUsernameChange}
        onRefreshRandom={refreshAvatarSeed}
        onContinue={() => void handleContinue()}
        onSignOut={confirmSignOut}
      />
      <ConfirmModal
        {...signOutConfirmModalProps}
        title="Sign out?"
        message="You'll need to sign in again to use the app."
        cancelLabel="Cancel"
        confirmLabel="Sign out"
        confirmTone="danger"
      />
    </StackScreenShell>
  );
}

const shellContentStyle = {
  flexGrow: 1,
  justifyContent: "center" as const,
};
