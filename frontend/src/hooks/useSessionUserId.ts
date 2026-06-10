import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase/client";
import { readStoredAuthSession } from "@/lib/supabase/mmkvAuthStorage";

/**
 * Resolves the signed-in Supabase user id (or `undefined` when signed out).
 * Reads the MMKV-persisted session synchronously on first render so query keys
 * match the React Query cache immediately; `getSession()` reconciles in the background.
 */
export function useSessionUserId(): {
  userId: string | undefined;
  authReady: boolean;
} {
  const [userId, setUserId] = useState<string | undefined>(
    () => readStoredAuthSession()?.user.id,
  );
  const [authReady, setAuthReady] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      setUserId(session?.user.id);
      setAuthReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id);
      setAuthReady(true);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return { userId, authReady };
}
