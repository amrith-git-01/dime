/**
 * Persisted app data (transactions, budgets, categories, insights, profile).
 *
 * Freshness is driven by invalidation (mutations + Supabase Realtime), not by
 * reopening the app. MMKV holds the React Query cache for up to 24 h.
 */
export const APP_QUERY_STALE_MS = 24 * 60 * 60 * 1000;

/** Matches QUERY_CACHE_MAX_AGE_MS — keep in-memory entries while MMKV blob is valid. */
export const APP_QUERY_GC_MS = 24 * 60 * 60 * 1000;
