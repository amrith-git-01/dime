/**
 * Persisted app data (transactions, budgets, categories, insights, profile).
 *
 * Freshness is driven by invalidation (mutations + the live-update socket), not by
 * reopening the app. MMKV holds the React Query cache for up to 7 days (so the last screens are
 * still there after a day or two offline); `APP_QUERY_STALE_MS` decides when an online launch refetches.
 * Transaction-derived queries use the shorter `TRANSACTIONS_QUERY_STALE_MS` so
 * they refetch when the app returns to the foreground.
 */
export const APP_QUERY_STALE_MS = 24 * 60 * 60 * 1000;

/** Matches QUERY_CACHE_MAX_AGE_MS — keep in-memory entries while MMKV blob is valid. */
export const APP_QUERY_GC_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Transaction lists/summaries go stale quickly; the 7-day gcTime still keeps them persisted.
 * Month insights are derived from the same rows and share this staleness.
 */
export const TRANSACTIONS_QUERY_STALE_MS = 60 * 1000;

/** Inbox and unread badge: pushes land server-side, so a day-old cache is too stale to trust. */
export const NOTIFICATIONS_QUERY_STALE_MS = 2 * 60 * 1000;

/**
 * A stored Broke Report snapshot never changes (a missing one may appear later, so only a cached
 * snapshot is immutable: see `useReport`).
 */
export const REPORT_SNAPSHOT_STALE_MS = Number.POSITIVE_INFINITY;

/** The reports list gains a row on the 1st and flips `viewed` when a report is opened. */
export const REPORT_LIST_STALE_MS = 5 * 60 * 1000;

/** Reminders change when the cron advances a repeat or another device edits one; two minutes is fresh enough. */
export const REMINDER_LIST_STALE_MS = 2 * 60 * 1000;
