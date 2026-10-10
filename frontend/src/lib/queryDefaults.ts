/**
 * Persisted app data (transactions, budgets, categories, insights, profile).
 *
 * Freshness is driven by invalidation (mutations + the live-update socket), not by
 * reopening the app. MMKV holds the React Query cache for up to 24 h.
 * Transaction-derived queries use the shorter `TRANSACTIONS_QUERY_STALE_MS` so
 * they refetch when the app returns to the foreground.
 */
export const APP_QUERY_STALE_MS = 24 * 60 * 60 * 1000;

/** Matches QUERY_CACHE_MAX_AGE_MS — keep in-memory entries while MMKV blob is valid. */
export const APP_QUERY_GC_MS = 24 * 60 * 60 * 1000;

/**
 * Transaction lists/summaries go stale quickly; the 24 h gcTime still keeps them persisted.
 * Month insights are derived from the same rows and share this staleness.
 */
export const TRANSACTIONS_QUERY_STALE_MS = 60 * 1000;

/** Inbox and unread badge: pushes land server-side, so a day-old cache is too stale to trust. */
export const NOTIFICATIONS_QUERY_STALE_MS = 2 * 60 * 1000;
