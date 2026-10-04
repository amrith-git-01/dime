import { PostgrestClient } from '@supabase/postgrest-js';
import { StorageClient } from '@supabase/storage-js';
import type { Context } from 'hono';

import { getConfig } from './env';
import type { AppBindings, Bindings } from './env';
import { ServiceUnavailableError } from './errors';

/**
 * The slice of Supabase this API uses: PostgREST (`from`, `rpc`) and Storage. We compose the two
 * sub-clients that `@supabase/supabase-js` wraps instead of importing the umbrella package: it also
 * constructs Auth, Realtime (websocket) and Functions clients on every `createClient`, which this
 * stateless Worker never uses (about 480 KiB of bundle, plus a per-request Auth session lookup).
 * The wire behaviour is the same: `apikey` + `Authorization: Bearer <key or user token>`.
 */
// Untyped schema on purpose: each repository declares its own row interfaces via `overrideTypes`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rest = PostgrestClient<any, any, 'public', any>;

export interface DimeSupabaseClient {
  from: Rest['from'];
  rpc: Rest['rpc'];
  storage: StorageClient;
}

// Stateless HTTP clients: no session storage, no token refresh timers. Creating one is just object
// allocation, so we make one per request (never share across requests: user-scoped clients carry a
// bearer token).
function createClient(supabaseUrl: string, key: string, bearer: string = key): DimeSupabaseClient {
  const base = supabaseUrl.trim().replace(/\/+$/, '');
  const headers = { apikey: key, Authorization: `Bearer ${bearer}`, 'X-Client-Info': 'dime-api' };
  const rest: Rest = new PostgrestClient(`${base}/rest/v1`, { headers, schema: 'public' });
  const storage = new StorageClient(`${base}/storage/v1`, headers);
  return {
    from: (relation) => rest.from(relation),
    rpc: (fn, args, options) => rest.rpc(fn, args, options),
    storage,
  };
}

/** Service-role client (bypasses RLS). Always filter by the JWT user id in queries. */
export function createServiceClient(env: Bindings): DimeSupabaseClient {
  const config = getConfig(env);
  if (!config.supabaseSecretKey) {
    throw new ServiceUnavailableError('Server missing SUPABASE_SECRET_KEY (required for database / Storage).');
  }
  return createClient(config.supabaseUrl, config.supabaseSecretKey);
}

/** Per-request lazily-created service client, cached on the context. */
export function getSupabase(c: Context<AppBindings>): DimeSupabaseClient {
  let client = c.get('supabase');
  if (!client) {
    client = createServiceClient(c.env);
    c.set('supabase', client);
  }
  return client;
}
