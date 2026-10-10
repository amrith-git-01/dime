import { create } from "zustand";

import { getSession, subscribeSession } from "@/lib/auth/session";
import type { AuthSession } from "@/lib/auth/types";

type AuthSessionState = {
  session: AuthSession | null;
  /** Changes only when the signed-in user changes, not on token refresh. */
  userId: string | undefined;
};

/** Seeded synchronously from the persisted session so first render already knows the user. */
export const useAuthSessionStore = create<AuthSessionState>(() => {
  const session = getSession();
  return { session, userId: session?.user.id };
});

// The single session subscription for the app; hooks read this store instead of subscribing.
// A refresh the server rejects (revoked or expired refresh token) arrives here as null.
subscribeSession((session) => {
  useAuthSessionStore.setState({ session, userId: session?.user.id });
});
