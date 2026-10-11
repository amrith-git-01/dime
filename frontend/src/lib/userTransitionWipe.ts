import type { QueryClient } from "@tanstack/react-query";

import { wipeUserData } from "@/lib/userDataWipe";
import { useAuthSessionStore } from "@/stores/authSessionStore";

/**
 * Wipes local user data whenever the signed-in user changes away from a known user (A to none,
 * or A to B), whatever caused it: explicit sign-out, a revoked/expired refresh token, or a
 * global sign-out from another device. Sign-in from signed-out (none to A) keeps the cache.
 * Returns an unsubscribe function.
 */
export function subscribeUserTransitionWipe(
  queryClient: QueryClient,
): () => void {
  return useAuthSessionStore.subscribe((state, prev) => {
    if (prev.userId !== undefined && state.userId !== prev.userId) {
      wipeUserData(queryClient);
    }
  });
}
