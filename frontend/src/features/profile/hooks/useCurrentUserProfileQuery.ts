import { useQuery } from "@tanstack/react-query";

import { useCurrentUserStore } from "@/stores/currentUserStore";
import { fetchMe } from "../api/meApi";
import { profileQueryKeys } from "../queryKeys";

export function useCurrentUserProfileQuery(userId: string | undefined) {
  const setProfile = useCurrentUserStore((s) => s.setProfile);

  return useQuery({
    queryKey: profileQueryKeys.current(userId),
    enabled: Boolean(userId),
    // The root route waits on this query: one bounded attempt (see `fetchMe`), also while the
    // device reports offline, so it settles in about 10 s instead of waiting for the network.
    retry: false,
    networkMode: "always",
    queryFn: async () => {
      const me = await fetchMe();
      setProfile(me);
      return me;
    },
    placeholderData: () => {
      const profile = useCurrentUserStore.getState().profile;
      return profile && profile.id === userId ? profile : undefined;
    },
  });
}
