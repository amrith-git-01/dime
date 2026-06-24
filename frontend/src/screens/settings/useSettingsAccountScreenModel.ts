import { useCallback, useEffect, useMemo, useState } from "react";

import { useAccountAvatarDraft } from "@/features/profile/hooks/useAccountAvatarDraft";
import { useCurrentUserProfileQuery } from "@/features/profile/hooks/useCurrentUserProfileQuery";
import { useSaveProfileMutation } from "@/features/profile/hooks/useSaveProfileMutation";
import { resolveProfileDisplay } from "@/features/profile/profileDisplay";
import { validateUsername } from "@/features/settings/utils/validateUsername";
import { useToast } from "@/features/toast/useToast";
import { useSessionUserId } from "@/hooks/useSessionUserId";
import { uploadProfileAvatarFromUrl } from "@/lib/api/uploadProfileAvatar";
import { useCurrentUserStore } from "@/stores/currentUserStore";

export function useSettingsAccountScreenModel() {
  const { userId } = useSessionUserId();
  const cachedProfile = useCurrentUserStore((s) => s.profile);
  const { data: queryProfile } = useCurrentUserProfileQuery(userId);
  const profile = queryProfile ?? cachedProfile;

  const { avatarUrl: savedAvatarUrl } = useMemo(
    () => resolveProfileDisplay(profile, userId),
    [profile, userId],
  );

  const saveMutation = useSaveProfileMutation();
  const { showToast } = useToast();
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const {
    previewUrl,
    isDirty: avatarDirty,
    refreshRandomAvatar,
    resetPreview,
  } = useAccountAvatarDraft(savedAvatarUrl);

  const initialUsername = profile?.username?.trim() ?? "";
  const [username, setUsername] = useState(initialUsername);

  useEffect(() => {
    setUsername(profile?.username?.trim() ?? "");
  }, [profile?.username]);

  const usernameDirty = useMemo(() => {
    const trimmed = username.trim();
    return trimmed.length > 0 && trimmed !== initialUsername;
  }, [initialUsername, username]);

  const saveDisabled = useMemo(
    () => !usernameDirty && !avatarDirty,
    [avatarDirty, usernameDirty],
  );

  const handleClear = useCallback(() => {
    setUsername(initialUsername);
    resetPreview();
  }, [initialUsername, resetPreview]);

  const handleSave = useCallback(async () => {
    const trimmed = username.trim();
    if (!trimmed) {
      return;
    }
    if (!usernameDirty && !avatarDirty) {
      return;
    }

    const validation = validateUsername(trimmed);
    if (!validation.isValid) {
      showToast({ variant: "error", message: validation.message });
      return;
    }

    try {
      let nextAvatarUrl = profile?.avatar_url?.trim() || savedAvatarUrl;

      if (avatarDirty) {
        setUploadingAvatar(true);
        const uploaded = await uploadProfileAvatarFromUrl(previewUrl);
        nextAvatarUrl = uploaded.avatar_url;
      }

      await saveMutation.mutateAsync({
        username: trimmed,
        currency: profile?.currency ?? "INR",
        avatarUrl: nextAvatarUrl,
      });
      showToast({ variant: "success", message: "Profile updated" });
    } catch {
      showToast({ variant: "error", message: "Could not update profile" });
    } finally {
      setUploadingAvatar(false);
    }
  }, [
    avatarDirty,
    previewUrl,
    profile?.avatar_url,
    profile?.currency,
    savedAvatarUrl,
    saveMutation,
    showToast,
    username,
    usernameDirty,
  ]);

  const busy = saveMutation.isPending || uploadingAvatar;

  return {
    editorProps: {
      previewAvatarUrl: previewUrl,
      username,
      email: profile?.email?.trim() || "—",
      onUsernameChange: setUsername,
      avatarBusy: uploadingAvatar,
      onRefreshRandomAvatar: refreshRandomAvatar,
      saveLoading: busy,
      saveDisabled: saveDisabled || busy,
      onClear: handleClear,
      onSave: () => void handleSave(),
    },
  };
}
