import { QueryClient, type QueryClientConfig } from "@tanstack/react-query";

/**
 * QueryClient for tests: garbage collection off (`gcTime: Infinity` starts no timers, so Jest
 * workers can exit cleanly) and no retries. Extra defaults are merged per call.
 */
export function createTestQueryClient(config: QueryClientConfig = {}): QueryClient {
  return new QueryClient({
    ...config,
    defaultOptions: {
      ...config.defaultOptions,
      queries: { retry: false, gcTime: Infinity, ...config.defaultOptions?.queries },
      mutations: { gcTime: Infinity, ...config.defaultOptions?.mutations },
    },
  });
}
