import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { settingsQueryKeys } from "@/features/settings/queryKeys";
import { syncExpoPushTokenForUser } from "@/features/settings/utils/syncExpoPushToken";
import { clearDimeAuthTokenCache } from "@/lib/api/dimeApi";
import { cancelDailyExpenseReminderSchedule } from "@/lib/notifications/dailyExpenseReminderSchedule";
import { clearPersistedNotifications } from "@/lib/notifications/notificationsMmkv";
import { clearQueryMmkv } from "@/lib/queryPersister";
import { clearPersistedUserSettings } from "@/lib/settings/userSettingsMmkv";
import { supabase } from "@/lib/supabase/client";
import { clearSupabaseAuthMmkv } from "@/lib/supabase/mmkvAuthStorage";
import { useCurrentUserStore } from "@/stores/currentUserStore";
import { usePermissionsPromptStore } from "@/stores/permissionsPromptStore";
import { reportError } from "@/lib/reportError";

export function useSignOut() {
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const signOut = useCallback(async () => {
    setLoading(true);
    try {
      try {
        await syncExpoPushTokenForUser(false);
      } catch (error) {
        reportError(error, "useSignOut delete Expo push token");
      }

      try {
        await cancelDailyExpenseReminderSchedule();
      } catch (error) {
        reportError(error, "useSignOut cancel daily expense reminder");
      }

      try {
        const { error } = await supabase.auth.signOut({ scope: "global" });
        if (error) throw error;
      } catch (error) {
        // Offline or server error: still drop the session on this device.
        reportError(error, "useSignOut global sign-out failed, using local");
        await supabase.auth.signOut({ scope: "local" });
      }

      try {
        await GoogleSignin.signOut();
      } catch {
        // Email/password users or no Google session — safe to ignore.
      }
    } finally {
      // Always wipe the previous user's local data, even when the network calls above failed.
      clearSupabaseAuthMmkv();
      clearDimeAuthTokenCache();
      clearQueryMmkv();
      clearPersistedNotifications();
      clearPersistedUserSettings();
      useCurrentUserStore.getState().clearProfile();
      usePermissionsPromptStore.getState().clearPendingAfterGoogleSignIn();
      queryClient.removeQueries({ queryKey: settingsQueryKeys.all });
      queryClient.clear();
      setLoading(false);
    }
  }, [queryClient]);

  return { signOut, loading };
}
