import { useAuthSessionStore } from "@/stores/authSessionStore";

/**
 * Resolves the signed-in user id (or `undefined` when signed out).
 * Backed by the shared auth session store, which is seeded synchronously from the
 * MMKV-persisted session so query keys match the React Query cache immediately.
 */
export function useSessionUserId(): { userId: string | undefined } {
  const userId = useAuthSessionStore((s) => s.userId);
  return { userId };
}
