import { parseBudgetAmount } from "@/features/categories/utils/parseBudgetAmount";
import { parsePositiveBudgetAmount } from "@/features/budgets/components/bento/budgetEditorPresets";

import {
  AMOUNT_TOO_LARGE_MESSAGE,
  isAmountAboveMax,
  MAX_AMOUNT_PAISE,
  paiseToAmountString,
  paiseToRupees,
  parseAmountInputToPaise,
  parseAmountInputToRupees,
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

describe("the API's amount limit (Rs 1,00,00,000.00)", () => {
  it("accepts exactly the limit and nothing above it", () => {
    expect(MAX_AMOUNT_PAISE).toBe(1_000_000_000);
    expect(parseAmountInputToPaise("10000000")).toBe(MAX_AMOUNT_PAISE);
    expect(parseAmountInputToPaise("1,00,00,000.00")).toBe(MAX_AMOUNT_PAISE);
    expect(parseAmountInputToPaise("10000000.01")).toBeNull();
    expect(parseAmountInputToPaise("99999999999999999999")).toBeNull();
  });

  it("tells a too-large amount from a malformed one", () => {
    expect(isAmountAboveMax("10000000.01")).toBe(true);
    expect(isAmountAboveMax("12345678901")).toBe(true);
    expect(isAmountAboveMax("10000000")).toBe(false);
    expect(isAmountAboveMax("abc")).toBe(false);
    expect(isAmountAboveMax("1.234")).toBe(false);
    expect(AMOUNT_TOO_LARGE_MESSAGE).toContain("1,00,00,000");
  });
});

describe("strict amount parsing is the one rule everywhere", () => {
  it.each([
    ["12abc", null],
    ["1.234", null],
    ["1e5", null],
    ["0", null],
    ["", null],
    ["12.5", 12.5],
    ["1,500", 1500],
  ])("parseAmountInputToRupees(%j)", (text, rupees) => {
    expect(parseAmountInputToRupees(text)).toBe(rupees);
  });

  it("budget amounts use it: no lenient parseFloat that reads 12abc as 12 or rounds 1.239", () => {
    for (const parse of [parseBudgetAmount, parsePositiveBudgetAmount]) {
      expect(parse("12abc")).toBeNull();
      expect(parse("1.239")).toBeNull();
      expect(parse("-50")).toBeNull();
      expect(parse("  ")).toBeNull();
      expect(parse("15,000")).toBe(15000);
      expect(parse("2500.50")).toBe(2500.5);
      expect(parse("10000000.01")).toBeNull();
    }
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
