import { useMutation, useQueryClient } from "@tanstack/react-query";

import { writePersistedUserSettings } from "@/lib/settings/userSettingsMmkv";

import { patchUserSettings } from "../api/settingsApi";
import { settingsQueryKeys } from "../queryKeys";
import type { UserSettings, UserSettingsPatch } from "../types";

export function useUpdateUserSettingsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: patchUserSettings,
    onMutate: async (patch: UserSettingsPatch) => {
      await queryClient.cancelQueries({ queryKey: settingsQueryKeys.user() });
      const previous = queryClient.getQueryData<UserSettings>(
        settingsQueryKeys.user(),
      );
      if (previous) {
        const optimistic = { ...previous, ...patch };
        queryClient.setQueryData(settingsQueryKeys.user(), optimistic);
        writePersistedUserSettings(optimistic);
      }
      return { previous };
    },
    onError: (_err, _patch, context) => {
      if (context?.previous) {
        queryClient.setQueryData(settingsQueryKeys.user(), context.previous);
        writePersistedUserSettings(context.previous);
      }
    },
    onSuccess: (data) => {
      queryClient.setQueryData(settingsQueryKeys.user(), data);
      writePersistedUserSettings(data);
    },
  });
}
