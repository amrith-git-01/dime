import { createEtagCache, etagKeyFor } from "../etagCache";

describe("etagKeyFor", () => {
  it("joins base, path and params sorted by name, dropping empty values", () => {
    expect(
      etagKeyFor({
        baseURL: "https://api.test",
        url: "/api/v1/transactions",
        params: { to: "b", from: "a", limit: 50, payee: undefined, x: null },
      }),
    ).toBe("https://api.test/api/v1/transactions?from=a&limit=50&to=b");
  });

  it("is the same for params given in a different order and differs by value", () => {
    const a = etagKeyFor({ baseURL: "b", url: "/u", params: { x: 1, y: 2 } });
    const b = etagKeyFor({ baseURL: "b", url: "/u", params: { y: 2, x: 1 } });
    const c = etagKeyFor({ baseURL: "b", url: "/u", params: { x: 1, y: 3 } });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("handles no params, URLSearchParams and arrays", () => {
    expect(etagKeyFor({ baseURL: "b", url: "/u" })).toBe("b/u");
    expect(
      etagKeyFor({ baseURL: "b", url: "/u", params: new URLSearchParams("z=1&a=2") }),
    ).toBe("b/u?a=2&z=1");
    expect(etagKeyFor({ baseURL: "b", url: "/u", params: { id: [2, 1] } })).toBe(
      "b/u?id=1&id=2",
    );
  });
});

describe("createEtagCache", () => {
  it("stores and returns entries", () => {
    const cache = createEtagCache(3);
    cache.set("a", { etag: 'W/"1"', data: { n: 1 } });
    expect(cache.get("a")).toEqual({ etag: 'W/"1"', data: { n: 1 } });
    expect(cache.get("missing")).toBeUndefined();
  });

  it("drops the least recently used entry past the bound", () => {
    const cache = createEtagCache(2);
    cache.set("a", { etag: "1", data: 1 });
    cache.set("b", { etag: "2", data: 2 });
    cache.get("a"); // a is now the most recently used
    cache.set("c", { etag: "3", data: 3 });
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBeDefined();
    expect(cache.get("c")).toBeDefined();
    expect(cache.size).toBe(2);
  });

  it("replaces an entry in place and supports delete and clear", () => {
    const cache = createEtagCache(2);
    cache.set("a", { etag: "1", data: 1 });
    cache.set("a", { etag: "2", data: 2 });
    expect(cache.size).toBe(1);
    expect(cache.get("a")?.etag).toBe("2");
    cache.delete("a");
    expect(cache.get("a")).toBeUndefined();
    cache.set("b", { etag: "1", data: 1 });
    cache.clear();
    expect(cache.size).toBe(0);
  });
});
