import {
  paiseToAmountString,
  paiseToRupees,
  parseAmountInputToPaise,
  toPaise,
} from "../paise";

describe("parseAmountInputToPaise", () => {
  it("parses whole, decimal and comma-grouped amounts", () => {
    expect(parseAmountInputToPaise("500")).toBe(50000);
    expect(parseAmountInputToPaise("250.5")).toBe(25050);
    expect(parseAmountInputToPaise("1,234.56")).toBe(123456);
    expect(parseAmountInputToPaise(".5")).toBe(50);
  });

  it("rejects junk, zero, negatives and extra decimals", () => {
    expect(parseAmountInputToPaise("12abc")).toBeNull();
    expect(parseAmountInputToPaise("1.234")).toBeNull();
    expect(parseAmountInputToPaise("0")).toBeNull();
    expect(parseAmountInputToPaise("-5")).toBeNull();
    expect(parseAmountInputToPaise("")).toBeNull();
    expect(parseAmountInputToPaise("1e5")).toBeNull();
  });
});

describe("paise math", () => {
  it("sums decimal strings exactly", () => {
    const total = ["0.1", "0.2"].reduce((sum, v) => sum + toPaise(v), 0);
    expect(total).toBe(30);
    expect(paiseToRupees(total)).toBe(0.3);
  });

  it("formats paise as a decimal string", () => {
    expect(paiseToAmountString(25050)).toBe("250.50");
    expect(paiseToAmountString(5)).toBe("0.05");
    expect(paiseToAmountString(100)).toBe("1.00");
  });

  it("treats invalid input as zero", () => {
    expect(toPaise("abc")).toBe(0);
    expect(toPaise(undefined)).toBe(0);
  });
});
