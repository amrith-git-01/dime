import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase/client";

/**
 * Resolves the signed-in Supabase user id (or `undefined` when signed out),
 * and `authReady` once the initial `getSession()` completes.
 */
export function useSessionUserId(): {
  userId: string | undefined;
  authReady: boolean;
} {
  const [userId, setUserId] = useState<string | undefined>();
  const [authReady, setAuthReady] = useState(false);

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
