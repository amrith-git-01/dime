import type { QueryClient } from "@tanstack/react-query";

import { etagCache } from "@/lib/api/etagCache";

/**
 * Re-download everything the app is showing from the server, in place. Cached data stays on screen
 * (including the profile, which gates navigation) until fresh data replaces it; nothing is wiped.
 * Active queries refetch now, inactive ones are marked stale and refetch when next used. Rejects
 * when a refetch fails so the caller can tell the user. The remembered ETags go first, so every
 * query downloads in full instead of being answered "not modified".
 */
export async function refreshAppDataFromServer(
  queryClient: QueryClient,
): Promise<void> {
  etagCache.clear();
  await queryClient.invalidateQueries(undefined, { throwOnError: true });
}
