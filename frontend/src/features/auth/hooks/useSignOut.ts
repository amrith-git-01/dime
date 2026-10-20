import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { syncExpoPushTokenForUser } from "@/features/settings/utils/syncExpoPushToken";
import { clearSession, getSession, signOutRemote } from "@/lib/auth/session";
import { cancelDailyExpenseReminderSchedule } from "@/lib/notifications/dailyExpenseReminderSchedule";
import { reportError } from "@/lib/reportError";
import { wipeUserData } from "@/lib/userDataWipe";

/** Server-side clean-up must never keep the user waiting; the session is already gone locally. */
const REMOTE_CLEANUP_TIMEOUT_MS = 4_000;

export function useSignOut() {
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const signOut = useCallback(async () => {
    setLoading(true);
    try {
      // Capture the credentials first: the best-effort server calls below run after they are cleared.
      const session = getSession();

      // Local data first, so the UI leaves the signed-in state immediately even when offline.
      clearSession();
      wipeUserData(queryClient);

      // Fire and forget, each with a short timeout. Sign-out is this device only ('local').
      if (session) {
        void Promise.allSettled([
          syncExpoPushTokenForUser(false, {
            authorization: `Bearer ${session.access_token}`,
            timeoutMs: REMOTE_CLEANUP_TIMEOUT_MS,
          }),
          signOutRemote("local", {
            session,
            timeoutMs: REMOTE_CLEANUP_TIMEOUT_MS,
          }),
        ]).then((results) => {
          for (const result of results) {
            if (result.status === "rejected") {
              // Offline or the session already expired: the server cleans up on its own.
              reportError(result.reason, "useSignOut remote clean-up failed");
            }
          }
        });
      }

      void cancelDailyExpenseReminderSchedule().catch((error) => {
        reportError(error, "useSignOut cancel daily expense reminder");
      });

      void GoogleSignin.signOut().catch(() => {
        // Email/password users or no Google session: safe to ignore.
      });
    } finally {
      setLoading(false);
    }
  }, [queryClient]);

  return { signOut, loading };
}
