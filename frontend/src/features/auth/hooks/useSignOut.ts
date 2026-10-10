import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { syncExpoPushTokenForUser } from "@/features/settings/utils/syncExpoPushToken";
import { clearSession, signOutRemote } from "@/lib/auth/session";
import { cancelDailyExpenseReminderSchedule } from "@/lib/notifications/dailyExpenseReminderSchedule";
import { wipeUserData } from "@/lib/userDataWipe";
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
        await signOutRemote("global");
      } catch (error) {
        // Offline or server error: still revoke this device's session if we can, then drop it locally.
        reportError(error, "useSignOut global sign-out failed, using local");
        try {
          await signOutRemote("local");
        } catch {
          // Offline: the server-side session expires on its own.
        }
      }

      try {
        await GoogleSignin.signOut();
      } catch {
        // Email/password users or no Google session — safe to ignore.
      }
    } finally {
      // Always wipe the previous user's local data, even when the network calls above failed.
      clearSession();
      wipeUserData(queryClient);
      usePermissionsPromptStore.getState().clearPendingAfterGoogleSignIn();
      setLoading(false);
    }
  }, [queryClient]);

  return { signOut, loading };
}
