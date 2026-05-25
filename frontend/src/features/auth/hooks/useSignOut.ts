import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { profileQueryKeys } from "@/features/profile/queryKeys";
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
      useCurrentUserStore.getState().clearProfile();
      queryClient.removeQueries({ queryKey: profileQueryKeys.all });
    } finally {
      setLoading(false);
    }
  }, [queryClient]);

  return { signOut, loading };
}
