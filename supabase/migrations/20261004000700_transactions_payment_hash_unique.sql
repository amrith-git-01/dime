-- R3: make duplicate capture impossible at the database level.
--
-- The capture pipeline (receipt / voice / SMS) and manual entry all dedupe on
-- `transactions.payment_hash` (sha256 of amount + counterparty + UTC minute + type). The application
-- looks the hash up before inserting, but two workers can race between the lookup and the insert.
-- This unique partial index closes that gap: the loser gets Postgres error 23505, which
-- `createTransaction` (api/src/features/transactions/service.ts) resolves to the winning row
-- (sparse merge / "existing"), exactly as the Python backend did for `unique_violation`.
--
-- Scope of the index: one ACTIVE (not soft-deleted) transaction per (user_id, payment_hash). Rows
-- without a hash (legacy rows, or rows whose edit would have collided) are never constrained, and a
-- soft-deleted transaction does not block re-capturing the same payment.
--
-- Safety of this migration:
--   1. Existing duplicates would make the index creation fail, so first, for every group of active
--      rows sharing (user_id, payment_hash), the OLDEST row keeps its hash and `payment_hash` is set
--      to NULL on the newer ones. Nothing is ever deleted. A NULL hash is exactly the "legacy
--      null-hash" state the app already handles (such a row simply no longer takes part in dedupe).
--   2. Then the unique index is created (`if not exists`, so re-running is harmless).
-- The table is briefly write-locked while the index builds; run it when traffic is low.

do $$
begin
  with ranked as (
    select
      id,
      row_number() over (
        partition by user_id, payment_hash
        order by created_at asc, id asc
      ) as rn
    from public.transactions
    where payment_hash is not null
      and deleted_at is null
  )
  update public.transactions t
     set payment_hash = null
    from ranked r
   where t.id = r.id
     and r.rn > 1;
end
$$;

create unique index if not exists transactions_user_payment_hash_active_uidx
  on public.transactions (user_id, payment_hash)
  where payment_hash is not null
    and deleted_at is null;
