import { randomUUID } from "expo-crypto";
import { useCallback, useEffect, useMemo, useState } from "react";

import { dicebearAdventurerNeutralUrl } from "@/lib/avatar/dicebearAdventurerNeutralUrl";

function normalizeAvatarUrl(url: string | null | undefined): string {
  return url?.trim() ?? "";
}

export function useAccountAvatarDraft(savedAvatarUrl: string) {
  const normalizedSaved = useMemo(
    () => normalizeAvatarUrl(savedAvatarUrl),
    [savedAvatarUrl],
  );

  const [previewUrl, setPreviewUrl] = useState(normalizedSaved);

  useEffect(() => {
    setPreviewUrl(normalizedSaved);
  }, [normalizedSaved]);

  const isDirty = previewUrl !== normalizedSaved;

  const refreshRandomAvatar = useCallback(() => {
    setPreviewUrl(dicebearAdventurerNeutralUrl(randomUUID()));
  }, []);

  const resetPreview = useCallback(() => {
    setPreviewUrl(normalizedSaved);
  }, [normalizedSaved]);

  return {
    previewUrl,
    isDirty,
    refreshRandomAvatar,
    resetPreview,
  };
}
