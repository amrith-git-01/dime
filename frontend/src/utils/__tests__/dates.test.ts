import { dayRangeIso, monthRangeIso } from "../dates";

describe("monthRangeIso", () => {
  it("returns a half-open range ending at the next month start", () => {
    const { from, to } = monthRangeIso(2026, 7);
    expect(new Date(from).getTime()).toBe(new Date(2026, 7, 1).getTime());
    expect(new Date(to).getTime()).toBe(new Date(2026, 8, 1).getTime());
  });

  it("rolls December into January of the next year", () => {
    const { to } = monthRangeIso(2026, 11);
    expect(new Date(to).getTime()).toBe(new Date(2027, 0, 1).getTime());
  });
});

describe("dayRangeIso", () => {
  it("covers exactly one local day as [from, to)", () => {
    const { from, to } = dayRangeIso("2026-08-15");
    expect(new Date(from).getTime()).toBe(new Date(2026, 7, 15).getTime());
    expect(new Date(to).getTime()).toBe(new Date(2026, 7, 16).getTime());
  });
});
