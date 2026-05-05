import { useMemo } from "react";

import { useCurrentUserProfileQuery } from "@/features/profile/hooks/useCurrentUserProfileQuery";
import { dicebearAdventurerNeutralUrl } from "@/lib/avatar/dicebearAdventurerNeutralUrl";

import { useSessionUserId } from "./useSessionUserId";

function displayNameFromEmail(email: string | null): string {
  if (!email) return "You";
  const at = email.indexOf("@");
  if (at <= 0) return email;
  return email.slice(0, at);
}

export type UseUserProfileResult = {
  username: string | null;
  avatarUrl: string;
  loading: boolean;
  fetchError: boolean;
  /** Resolved line-2 label: username, else email local-part, else "You". */
  displayName: string;
};

export function useUserProfile(): UseUserProfileResult {
  const { userId, authReady } = useSessionUserId();
  const {
    data: profile,
    isLoading,
    isError,
  } = useCurrentUserProfileQuery(userId);

  const loading = !authReady || (!!userId && isLoading);
  const fetchError = Boolean(userId && isError);

  const username = profile?.username ?? null;
  const email = profile?.email ?? null;
  const avatarUrlFromDb =
    profile?.avatar_url?.trim() && profile.avatar_url.trim().length > 0
      ? profile.avatar_url.trim()
      : null;
  const userIdForDicebear = profile?.id ?? userId ?? null;

  const displayName = useMemo(() => {
    const trimmed = username?.trim();
    if (trimmed) return trimmed;
    const fromEmail = displayNameFromEmail(email);
    return fromEmail.length > 0 ? fromEmail : "You";
  }, [username, email]);

  const avatarUrl = useMemo(() => {
    if (avatarUrlFromDb) {
      return avatarUrlFromDb;
    }
    return dicebearAdventurerNeutralUrl(userIdForDicebear ?? "dime");
  }, [avatarUrlFromDb, userIdForDicebear]);

  return {
    username,
    avatarUrl,
    loading,
    fetchError,
    displayName,
  };
}
