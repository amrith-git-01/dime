import type { QueryKey } from "@tanstack/react-query";

/**
 * `placeholderData` that keeps the previous query's data across key changes (month switches)
 * but never across users: the previous key must carry the current user id.
 */
export function keepPreviousDataForUser(userId: string | undefined) {
  return <TData>(
    previousData: TData | undefined,
    previousQuery: { queryKey: QueryKey } | undefined,
  ): TData | undefined =>
    userId !== undefined && previousQuery?.queryKey.includes(userId)
      ? previousData
      : undefined;
}
