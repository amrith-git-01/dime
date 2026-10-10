import { useMemo } from "react";

import { useCurrentUserProfileQuery } from "@/features/profile/hooks/useCurrentUserProfileQuery";
import { resolveProfileDisplay } from "@/features/profile/profileDisplay";
import { useCurrentUserStore } from "@/stores/currentUserStore";

import { useSessionUserId } from "./useSessionUserId";

export type UseUserProfileResult = {
  username: string | null;
  email: string | null;
  avatarUrl: string;
  loading: boolean;
  fetchError: boolean;
  /** Resolved line-2 label: username, else email local-part, else "You". */
  displayName: string;
};

export function useUserProfile(): UseUserProfileResult {
  const { userId } = useSessionUserId();
  const storedProfile = useCurrentUserStore((s) => s.profile);
  const cachedProfile = storedProfile?.id === userId ? storedProfile : null;
  const {
    data: queryProfile,
    isLoading,
    isError,
  } = useCurrentUserProfileQuery(userId);

  const profile = queryProfile ?? cachedProfile;
  const loading = !!userId && !profile && isLoading;
  const fetchError = Boolean(userId && isError && !profile);

  const username = profile?.username ?? null;

  const { displayName, avatarUrl } = useMemo(
    () => resolveProfileDisplay(profile, userId),
    [profile, userId],
  );

  return {
    username,
    email: profile?.email ?? null,
    avatarUrl,
    loading,
    fetchError,
    displayName,
  };
}
