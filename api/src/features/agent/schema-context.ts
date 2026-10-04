/** What `run_sql` may read: the allowlist the validator enforces and the schema text the model sees. */

export const ALLOWED_TABLES: ReadonlySet<string> = new Set(['transactions', 'categories', 'budgets', 'category_budgets', 'users']);

export const RUN_SQL_SCHEMA = `Schema (PostgreSQL, currency INR; row level security already limits every table to the signed-in user, never add user_id filters):
transactions(id uuid, amount numeric (always positive), type text 'debit'=spending|'credit'=income, counterparty_name text, counterparty_normalized text, counterparty_type text, category_id uuid -> categories.id, transaction_at timestamptz, deleted_at timestamptz, created_at)
categories(id uuid, name text, is_system boolean)
budgets(monthly_budget numeric, daily_budget numeric)
category_budgets(category_id uuid, monthly_amount numeric)
users(id uuid, currency text)
Always: deleted_at IS NULL. Half-open ranges on transaction_at: >= start AND < next day/month start, with explicit offsets or UTC instants (e.g. '2026-06-01T00:00:00+05:30', from the NOW timezone). Local day: (transaction_at AT TIME ZONE '<timezone from NOW>')::date. One SELECT only.`;
