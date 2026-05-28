import { useMemo } from "react";

import { useCurrentUserProfileQuery } from "@/features/profile/hooks/useCurrentUserProfileQuery";
import { resolveProfileDisplay } from "@/features/profile/profileDisplay";
import { useCurrentUserStore } from "@/stores/currentUserStore";

import { useSessionUserId } from "./useSessionUserId";

function timeOfDayGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function useHomeProfile() {
  const { userId, authReady } = useSessionUserId();
  const cachedProfile = useCurrentUserStore((s) => s.profile);
  const {
    data: queryProfile,
    isLoading,
    isError,
    refetch,
  } = useCurrentUserProfileQuery(userId);

  const profile = queryProfile ?? cachedProfile;
  const loading = !authReady || (!!userId && !profile && isLoading);
  const fetchError = Boolean(userId && isError && !profile);

  const { displayName, avatarUrl } = useMemo(
    () => resolveProfileDisplay(profile, userId),
    [profile, userId],
  );

  return {
    greeting: timeOfDayGreeting(),
    displayName,
    avatarUrl,
    loading,
    fetchError,
    refetch,
  };
}
