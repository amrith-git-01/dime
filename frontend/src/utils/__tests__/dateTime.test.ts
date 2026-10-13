import { resolvePresetTransactionAt } from "../dateTime";

const NOW = new Date(2026, 9, 13, 16, 45, 10);

describe("resolvePresetTransactionAt", () => {
  it("is now without a preset", () => {
    expect(resolvePresetTransactionAt(undefined, NOW)).toBe(NOW);
  });

  it("is now for today", () => {
    expect(resolvePresetTransactionAt("2026-10-13", NOW)).toBe(NOW);
  });

  it("is now for a future day", () => {
    expect(resolvePresetTransactionAt("2026-10-20", NOW)).toBe(NOW);
  });

  it("is noon local on a past day", () => {
    const result = resolvePresetTransactionAt("2026-10-02", NOW);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(9);
    expect(result.getDate()).toBe(2);
    expect(result.getHours()).toBe(12);
    expect(result.getMinutes()).toBe(0);
  });

  it("falls back to now for a malformed preset", () => {
    expect(resolvePresetTransactionAt("2026-1-2x", NOW)).toBe(NOW);
  });
});
