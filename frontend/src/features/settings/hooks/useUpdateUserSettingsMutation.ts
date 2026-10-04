import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useSessionUserId } from "@/hooks/useSessionUserId";
import { writePersistedUserSettings } from "@/lib/settings/userSettingsMmkv";

import { patchUserSettings } from "../api/settingsApi";
import { settingsQueryKeys } from "../queryKeys";
import type { UserSettings, UserSettingsPatch } from "../types";

export function useUpdateUserSettingsMutation() {
  const queryClient = useQueryClient();
  const { userId } = useSessionUserId();

  return useMutation({
    mutationFn: patchUserSettings,
    onMutate: async (patch: UserSettingsPatch) => {
      await queryClient.cancelQueries({ queryKey: settingsQueryKeys.user(userId) });
      const previous = queryClient.getQueryData<UserSettings>(
        settingsQueryKeys.user(userId),
      );
      if (previous) {
        const optimistic = { ...previous, ...patch };
        queryClient.setQueryData(settingsQueryKeys.user(userId), optimistic);
        if (userId) {
          writePersistedUserSettings(userId, optimistic);
        }
      }
      return { previous };
    },
    onError: (_err, _patch, context) => {
      if (context?.previous) {
        queryClient.setQueryData(settingsQueryKeys.user(userId), context.previous);
        if (userId) {
          writePersistedUserSettings(userId, context.previous);
        }
      }
    },
    onSuccess: (data) => {
      queryClient.setQueryData(settingsQueryKeys.user(userId), data);
      if (userId) {
        writePersistedUserSettings(userId, data);
      }
    },
  });
}
