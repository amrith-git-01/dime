-- B6: make notification dedupe race-free. The API now does
--   upsert(..., on_conflict="user_id,dedupe_key", ignore_duplicates=True)
-- instead of select-then-insert. PostgREST cannot target a partial index, so this is a plain
-- (non-partial) unique index; NULL dedupe_key rows are unaffected (NULLs are distinct).
--
-- Behaviour note: a soft-deleted notification (deleted_at set) still occupies its key, so the
-- same event is not re-notified after the user dismisses it.

-- Remove existing duplicates first (keep the oldest row per key) or the index cannot be built.
delete from public.notifications n
using public.notifications keep
where n.user_id = keep.user_id
  and n.dedupe_key is not null
  and n.dedupe_key = keep.dedupe_key
  and (keep.created_at, keep.id) < (n.created_at, n.id);

create unique index if not exists notifications_user_dedupe_key_uidx
  on public.notifications (user_id, dedupe_key);
