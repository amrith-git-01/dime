import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { clearDimeAuthTokenCache } from "@/lib/api/dimeApi";
import { clearPersistedNotifications } from "@/lib/notifications/notificationsMmkv";
import { clearQueryMmkv } from "@/lib/queryPersister";
import { supabase } from "@/lib/supabase/client";
import { clearSupabaseAuthMmkv } from "@/lib/supabase/mmkvAuthStorage";
import { useCurrentUserStore } from "@/stores/currentUserStore";

export function useSignOut() {
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const signOut = useCallback(async () => {
    setLoading(true);
    try {
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
      useCurrentUserStore.getState().clearProfile();
      queryClient.clear();
    } finally {
      setLoading(false);
    }
  }, [queryClient]);

  return { signOut, loading };
}
