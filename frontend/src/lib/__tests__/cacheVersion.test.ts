import { buildCacheBuster } from "../cacheVersion";

describe("buildCacheBuster", () => {
  const base = { appVersion: "1.0.0", updateId: "u1", schemaVersion: 1 };

  it("changes with the app version, update id and schema version", () => {
    const buster = buildCacheBuster(base);
    expect(buildCacheBuster({ ...base, appVersion: "1.0.1" })).not.toBe(buster);
    expect(buildCacheBuster({ ...base, updateId: "u2" })).not.toBe(buster);
    expect(buildCacheBuster({ ...base, schemaVersion: 2 })).not.toBe(buster);
  });

  it("is stable for identical inputs and tolerates missing parts", () => {
    expect(buildCacheBuster(base)).toBe(buildCacheBuster({ ...base }));
    expect(
      buildCacheBuster({
        appVersion: undefined,
        updateId: null,
        schemaVersion: 1,
      }),
    ).toBe("0|embedded|v1");
  });
});
