import type { Session } from "@supabase/supabase-js";
import { create } from "zustand";

import { supabase } from "@/lib/supabase/client";
import { readStoredAuthSession } from "@/lib/supabase/mmkvAuthStorage";

type AuthSessionState = {
  session: Session | null;
  /** Changes only when the signed-in user changes, not on token refresh. */
  userId: string | undefined;
};

/** Seeded synchronously from the persisted session so first render already knows the user. */
export const useAuthSessionStore = create<AuthSessionState>(() => {
  const session = readStoredAuthSession();
  return { session, userId: session?.user.id };
});

function applySession(session: Session | null): void {
  useAuthSessionStore.setState({ session, userId: session?.user.id });
}

// The single Supabase auth subscription for the app; hooks read this store instead of subscribing.
let authEventSeen = false;

supabase.auth.onAuthStateChange((_event, session) => {
  authEventSeen = true;
  applySession(session);
});

void supabase.auth
  .getSession()
  .then(({ data: { session } }) => {
    // An auth event that already fired is newer than this initial read.
    if (!authEventSeen) {
      applySession(session);
    }
  })
  .catch(() => {
    // Keep the persisted session; the auth listener reconciles once Supabase is reachable.
  });
