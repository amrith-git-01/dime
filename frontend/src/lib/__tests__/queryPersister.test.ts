import { dehydrate, QueryClient } from "@tanstack/react-query";
import { createMMKV } from "react-native-mmkv";

import { categoriesQueryKeys } from "@/features/categories/queryKeys";
import { CACHE_BUSTER } from "@/lib/cacheVersion";
import { resetMockMmkv } from "@/test-utils/mockMmkv";

import {
  appQueryPersistOptions,
  hasPersistedQueryCache,
  QUERY_CACHE_KEY,
  QUERY_CACHE_MAX_AGE_MS,
  restoreQueryCache,
} from "../queryPersister";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("@/lib/reportError", () => ({ reportError: jest.fn() }));

const KEY = categoriesQueryKeys.list("user-a");

function writeBlob(overrides: { buster?: string; timestamp?: number }): void {
  const source = new QueryClient();
  source.setQueryData(KEY, [{ id: "c1" }]);
  const clientState = dehydrate(source);
  source.clear();
  createMMKV({ id: "rq-cache" }).set(
    QUERY_CACHE_KEY,
    JSON.stringify({
      timestamp: Date.now(),
      buster: CACHE_BUSTER,
      clientState,
      ...overrides,
    }),
  );
}

describe("restoreQueryCache", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    resetMockMmkv();
    queryClient = new QueryClient();
  });

  afterEach(() => queryClient.clear());

  it("persists with the current buster", () => {
    expect(appQueryPersistOptions.buster).toBe(CACHE_BUSTER);
  });

  it("hydrates a blob written under the same buster", () => {
    writeBlob({});
    expect(restoreQueryCache(queryClient)).toBe(true);
    expect(queryClient.getQueryData(KEY)).toEqual([{ id: "c1" }]);
  });

  it("discards a blob written under a different buster", () => {
    writeBlob({ buster: "0.9.0|embedded|v1" });
    expect(restoreQueryCache(queryClient)).toBe(false);
    expect(queryClient.getQueryData(KEY)).toBeUndefined();
    expect(hasPersistedQueryCache()).toBe(false);
  });

  it("discards a blob without a buster (written before busting existed)", () => {
    writeBlob({ buster: undefined });
    expect(restoreQueryCache(queryClient)).toBe(false);
    expect(queryClient.getQueryData(KEY)).toBeUndefined();
  });

  it("discards an expired blob", () => {
    writeBlob({ timestamp: Date.now() - QUERY_CACHE_MAX_AGE_MS - 1 });
    expect(restoreQueryCache(queryClient)).toBe(false);
    expect(hasPersistedQueryCache()).toBe(false);
  });

  it("clears a corrupt blob", () => {
    createMMKV({ id: "rq-cache" }).set(QUERY_CACHE_KEY, "{not json");
    expect(restoreQueryCache(queryClient)).toBe(false);
    expect(hasPersistedQueryCache()).toBe(false);
  });
});
