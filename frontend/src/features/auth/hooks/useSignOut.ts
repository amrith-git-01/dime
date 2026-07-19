import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { settingsQueryKeys } from "@/features/settings/queryKeys";
import { syncExpoPushTokenForUser } from "@/features/settings/utils/syncExpoPushToken";
import { clearDimeAuthTokenCache } from "@/lib/api/dimeApi";
import { clearPersistedNotifications } from "@/lib/notifications/notificationsMmkv";
import { clearQueryMmkv } from "@/lib/queryPersister";
import { clearPersistedUserSettings } from "@/lib/settings/userSettingsMmkv";
import { supabase } from "@/lib/supabase/client";
import { clearSupabaseAuthMmkv } from "@/lib/supabase/mmkvAuthStorage";
import { useCurrentUserStore } from "@/stores/currentUserStore";
import { usePermissionsPromptStore } from "@/stores/permissionsPromptStore";

export function useSignOut() {
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const signOut = useCallback(async () => {
    setLoading(true);
    try {
      try {
        await syncExpoPushTokenForUser(false);
      } catch (error) {
        console.warn(
          "[useSignOut] Failed to delete Expo push token on sign-out",
          error,
        );
      }

      const { error } = await supabase.auth.signOut({ scope: "global" });
      if (error) throw error;

      try {
        await GoogleSignin.signOut();
      } catch {
        // Email/password users or no Google session — safe to ignore.
      }

      clearSupabaseAuthMmkv();
      clearDimeAuthTokenCache();
      clearQueryMmkv();
      clearPersistedNotifications();
      clearPersistedUserSettings();
      useCurrentUserStore.getState().clearProfile();
      usePermissionsPromptStore.getState().clearPendingAfterGoogleSignIn();
      queryClient.removeQueries({ queryKey: settingsQueryKeys.all });
      queryClient.clear();
    } finally {
      setLoading(false);
    }
  }, [queryClient]);

  return { signOut, loading };
}
