import type { Query, QueryKey } from "@tanstack/react-query";
import type { PersistedClient } from "@tanstack/react-query-persist-client";

import { insightsQueryKeys } from "@/features/analytics/queryKeys";
import { notificationQueryKeys } from "@/features/notifications/queryKeys";
import { transactionsQueryKeys } from "@/features/transactions/queryKeys";
import { reportError } from "@/lib/reportError";

/** Serialized size above which non-essential queries are evicted from the persisted blob. */
export const PERSISTED_CACHE_MAX_CHARS = 1_500_000;

/** Short-lived signed media URLs (C7) must never rest on disk; detail always refetches them. */
const MEDIA_URL_FIELDS: ReadonlySet<string> = new Set([
  "receipt_url",
  "voice_url",
]);

const TRANSACTIONS_ROOT = transactionsQueryKeys.all[0];
const INSIGHTS_ROOT = insightsQueryKeys.all[0];

/** Key layout `[root, kind, userId, year, month, ...]`, shared by month-scoped queries. */
function monthOfKey(
  queryKey: QueryKey,
): { year: number; month: number } | null {
  const [root, kind, , year, month] = queryKey;
  const monthScoped =
    (root === TRANSACTIONS_ROOT &&
      (kind === "monthPages" || kind === "monthSummary")) ||
    (root === INSIGHTS_ROOT && kind === "month");
  if (!monthScoped || typeof year !== "number" || typeof month !== "number") {
    return null;
  }
  return { year, month };
}

/** Only the current and previous calendar month are worth restoring offline. */
function isRecentMonth(
  { year, month }: { year: number; month: number },
  now: Date,
): boolean {
  const currentIndex = now.getFullYear() * 12 + now.getMonth();
  const index = year * 12 + (month - 1);
  return index === currentIndex || index === currentIndex - 1;
}

/**
 * Which queries are written to disk. Lists with arbitrary ranges/filters, per-month history
 * beyond the previous month, detail rows and notifications (own snapshot) stay in memory only.
 */
export function shouldDehydrateQuery(
  query: Query,
  now: Date = new Date(),
): boolean {
  if (query.state.status !== "success") {
    return false;
  }
  const [root, kind] = query.queryKey;
  if (root === notificationQueryKeys.all[0]) {
    return false;
  }
  if (root === TRANSACTIONS_ROOT) {
    if (kind === "detail" || kind === "rangePages" || kind === "filteredMonthPages") {
      return false;
    }
  }
  const month = monthOfKey(query.queryKey);
  return month === null || isRecentMonth(month, now);
}

function isInfiniteData(
  data: unknown,
): data is { pages: unknown[]; pageParams: unknown[] } {
  return (
    typeof data === "object" &&
    data !== null &&
    Array.isArray((data as { pages?: unknown }).pages) &&
    Array.isArray((data as { pageParams?: unknown }).pageParams)
  );
}

/** Copy of `value` with every signed-media field nulled; never mutates the live cache. */
function stripMediaUrls(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripMediaUrls);
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        MEDIA_URL_FIELDS.has(key) && typeof entry === "string"
          ? null
          : stripMediaUrls(entry),
      ]),
    );
  }
  return value;
}

type PersistedQuery = PersistedClient["clientState"]["queries"][number];

function slimQuery(query: PersistedQuery): PersistedQuery {
  let data: unknown = query.state.data;
  // Older pages are fetched on demand; the first page is the cold-start seed.
  if (isInfiniteData(data)) {
    data = {
      pages: data.pages.slice(0, 1),
      pageParams: data.pageParams.slice(0, 1),
    };
  }
  if (query.queryKey[0] === TRANSACTIONS_ROOT) {
    data = stripMediaUrls(data);
  }
  return data === query.state.data
    ? query
    : { ...query, state: { ...query.state, data } };
}

/** Paged month lists are the only bulky queries; everything else is small and kept. */
function isEssentialQuery(query: PersistedQuery): boolean {
  const [root, kind] = query.queryKey;
  return root !== TRANSACTIONS_ROOT || kind !== "monthPages";
}

function withQueries(
  client: PersistedClient,
  queries: PersistedQuery[],
): PersistedClient {
  return { ...client, clientState: { ...client.clientState, queries } };
}

/**
 * Persister `serialize`: trims the dehydrated cache (first page only, no signed media URLs) and
 * enforces the size budget in every build by evicting non-essential queries.
 */
export function serializePersistedClient(client: PersistedClient): string {
  const slim = withQueries(
    client,
    client.clientState.queries.map(slimQuery),
  );
  const json = JSON.stringify(slim);
  if (json.length <= PERSISTED_CACHE_MAX_CHARS) {
    return json;
  }

  const kept = slim.clientState.queries.filter(isEssentialQuery);
  reportError(
    new Error("Persisted query cache over budget"),
    `queryCachePolicy evicting ${slim.clientState.queries.length - kept.length} of ${slim.clientState.queries.length} queries, ${json.length} chars`,
  );
  return JSON.stringify(withQueries(slim, kept));
}
