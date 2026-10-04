/**
 * Persisted app data (transactions, budgets, categories, insights, profile).
 *
 * Freshness is driven by invalidation (mutations + Supabase Realtime), not by
 * reopening the app. MMKV holds the React Query cache for up to 24 h.
 * Transaction-derived queries use the shorter `TRANSACTIONS_QUERY_STALE_MS` so
 * they refetch when the app returns to the foreground.
 */
export const APP_QUERY_STALE_MS = 24 * 60 * 60 * 1000;

/** Matches QUERY_CACHE_MAX_AGE_MS — keep in-memory entries while MMKV blob is valid. */
export const APP_QUERY_GC_MS = 24 * 60 * 60 * 1000;

/** Transaction lists/summaries go stale quickly; the 24 h gcTime still keeps them persisted. */
export const TRANSACTIONS_QUERY_STALE_MS = 60 * 1000;
