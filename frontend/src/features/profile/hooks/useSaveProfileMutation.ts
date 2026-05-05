import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useCurrentUserStore } from "@/stores/currentUserStore";
import { putProfile } from "../api/meApi";
import { profileQueryKeys } from "../queryKeys";

export type SaveProfileVariables = {
  username: string;
  currency?: string;
  avatarUrl?: string | null;
};

export function useSaveProfileMutation() {
  const queryClient = useQueryClient();
  const setProfile = useCurrentUserStore((s) => s.setProfile);

  return useMutation({
    mutationFn: async (vars: SaveProfileVariables) =>
      putProfile({
        username: vars.username,
        currency: vars.currency ?? "INR",
        avatar_url:
          vars.avatarUrl != null && vars.avatarUrl.trim() !== ""
            ? vars.avatarUrl.trim()
            : undefined,
      }),
    onSuccess: (data) => {
      setProfile(data);
      queryClient.setQueryData(profileQueryKeys.current(data.id), data);
      void queryClient.invalidateQueries({ queryKey: profileQueryKeys.all });
    },
  });
}
