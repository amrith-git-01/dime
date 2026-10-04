import type { Bindings } from '../../core/env';
import { AgentDbUnavailableError } from './sql-executor';
import type { SqlClient } from './sql-executor';

/**
 * Per-request postgres.js client over the Hyperdrive binding (Hyperdrive owns the real connection
 * pool, so creating a client per request is the documented pattern). postgres.js is imported on
 * first use, so routes that never touch the agent do not pay for it at cold start.
 *
 * - `prepare: true` (default) keeps Hyperdrive's prepared-statement caching; the agent's own SQL goes
 *   through `unsafe()`, which is never prepared.
 * - `fetch_types: false` saves a round trip; the three parsers below cover what the agent returns.
 * - Hyperdrive pools in TRANSACTION mode: the connection is pinned for exactly one transaction and reset
 *   afterwards. That is what the executor relies on: `set_config(..., true)`, `set local role` and
 *   `set local statement_timeout` live and die inside the one `begin read only` block, so no claims or
 *   role can leak to the next user of the pooled connection (a plain `SET` outside a transaction would
 *   be discarded, and must never be used). Pipelining the statements in that one transaction is fine:
 *   they go out back to back on the single pinned connection, in order. Queries inside a transaction
 *   are never served from Hyperdrive's query cache; create the config with `--caching-disabled` anyway
 *   (see DEPLOY.md) because identical SQL text from different users must never share a cached result.
 *   Use the direct or SESSION-pooler connection string as the origin, never Supabase's transaction pooler
 *   (port 6543): that would stack two transaction poolers over prepared statements.
 * - numeric / int8 arrive as numbers (Python returned float / int) and `date` stays 'YYYY-MM-DD'.
 */
export async function openAgentDb(env: Bindings): Promise<SqlClient> {
  const connectionString = (env as { HYPERDRIVE?: Hyperdrive }).HYPERDRIVE?.connectionString;
  if (!connectionString) throw new AgentDbUnavailableError('HYPERDRIVE binding is not configured.');
  const { default: postgres } = await import('postgres');
  const sql = postgres(connectionString, {
    max: 1,
    fetch_types: false,
    prepare: true,
    connect_timeout: 10,
    idle_timeout: 5,
    types: {
      bigint: { to: 20, from: [20], parse: (x: string) => Number(x), serialize: (x: unknown) => String(x) },
      numeric: { to: 1700, from: [1700], parse: (x: string) => Number(x), serialize: (x: unknown) => String(x) },
      dateOnly: { to: 1082, from: [1082], parse: (x: string) => x, serialize: (x: unknown) => String(x) },
    },
  });
  return sql;
}
