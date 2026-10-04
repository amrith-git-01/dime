# Supabase migrations

All database schema changes live here as timestamped SQL files in `migrations/`
(`YYYYMMDDHHMMSS_description.sql`).

## Baseline schema not yet captured

The original schema (tables, RLS policies, the `transactions_period_summary` RPC, ...)
predates this folder. Capture it once so the history is complete:

```bash
supabase login
supabase link --project-ref <ref>
supabase db pull
```

`db pull` writes a baseline migration. Make sure its timestamp sorts **before**
`20260816000000_email.sql` (rename it if needed) so migrations apply in order on a fresh database.

## Making changes

Never edit the database by hand. Add a new timestamped file under `migrations/`.

## Applying

- CLI: `supabase db push` (applies pending migrations to the linked project), or
- Manually: paste each new file into the Supabase SQL editor, in timestamp order.
