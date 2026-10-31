import type { Query, QueryKey } from "@tanstack/react-query";
import type { PersistedClient } from "@tanstack/react-query-persist-client";

import { insightsQueryKeys } from "@/features/analytics/queryKeys";
import { limitsQueryKeys } from "@/features/limits/queryKeys";
import { reportQueryKeys } from "@/features/brokeReport/queryKeys";
import { isReportSnapshot } from "@/features/brokeReport/utils/snapshotShape";
import { onboardingQueryKeys } from "@/features/onboarding/queryKeys";
import { notificationQueryKeys } from "@/features/notifications/queryKeys";
import { payeesQueryKeys } from "@/features/payees/queryKeys";
import { transactionsQueryKeys } from "@/features/transactions/queryKeys";
import { reportError } from "@/lib/reportError";

/** Serialized size above which non-essential queries are evicted from the persisted blob. */
export const PERSISTED_CACHE_MAX_CHARS = 1_500_000;

/** Short-lived signed media URLs (C7) must never rest on disk; detail always refetches them. */
const MEDIA_URL_FIELDS: ReadonlySet<string> = new Set([
  "receipt_url",
  "voice_url",
]);

const REPORTS_ROOT = reportQueryKeys.all[0];
const REMINDERS_ROOT = "reminders";
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
 * beyond the previous month, detail rows, notifications (own snapshot), daily limits, onboarding progress and payee search stay in memory only.
 * Broke Reports are persisted on purpose: the list and each snapshot are small and a stored snapshot never
 * changes, so a report opens offline. A "no such report" answer (`null`) is not: it may exist tomorrow.
 * Reminders are never persisted: they carry payee names and UPI IDs, so they are fetched fresh and live in memory only.
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
  // Search results are cheap to refetch and change with every keystroke.
  if (root === payeesQueryKeys.all[0]) {
    return false;
  }
  // Today's counters are only true for minutes; never restore yesterday's numbers on launch.
  if (root === limitsQueryKeys.all[0]) {
    return false;
  }
  // "Get started" progress moves with the user's own actions; a restored copy would only be stale.
  if (root === onboardingQueryKeys.all[0]) {
    return false;
  }
  if (root === REPORTS_ROOT) {
    // Only what is usable: a snapshot that is one, a list that is a list. Never a "no such report".
    return String(kind).startsWith("period")
      ? isReportSnapshot(query.state.data)
      : Array.isArray(query.state.data);
  }
  // Reminders hold payee names and UPI IDs: memory only, never the on-disk blob.
  if (root === REMINDERS_ROOT) {
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
