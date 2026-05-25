import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useMemo } from "react";

import { useCurrentUserProfileQuery } from "@/features/profile/hooks/useCurrentUserProfileQuery";
import { dicebearAdventurerNeutralUrl } from "@/lib/avatar/dicebearAdventurerNeutralUrl";

import { useSessionUserId } from "./useSessionUserId";

function timeOfDayGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function displayNameFromEmail(email: string | null): string {
  if (!email) return "You";
  const at = email.indexOf("@");
  if (at <= 0) return email;
  return email.slice(0, at);
}

export function useHomeProfile() {
  const { userId, authReady } = useSessionUserId();
  const {
    data: profile,
    isLoading,
    isError,
    refetch,
  } = useCurrentUserProfileQuery(userId);

  useFocusEffect(
    useCallback(() => {
      if (userId) {
        void refetch();
      }
    }, [refetch, userId]),
  );

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
    greeting: timeOfDayGreeting(),
    displayName,
    avatarUrl,
    loading,
    fetchError,
    refetch,
  };
}
