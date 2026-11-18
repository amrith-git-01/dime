import type { TransactionRow } from "../../types";
import { creditSummary } from "../paybackSummary";
import { transactionBadges } from "../transactionDisplay";

// Jest hoists these above the imports.
jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("expo-navigation-bar", () => ({ setStyle: jest.fn() }));
jest.mock("expo-system-ui", () => ({ setBackgroundColorAsync: jest.fn(() => Promise.resolve()) }));

function row(over: Partial<TransactionRow>): TransactionRow {
  return {
    id: "t1",
    amount: "1000.00",
    type: "debit",
    transaction_at: "2026-11-15T10:00:00.000Z",
    ...over,
  } as TransactionRow;
}

describe("transactionBadges", () => {
  it("gives everyday spend and income no badge", () => {
    expect(transactionBadges(row({ kind: "spend" }))).toEqual([]);
    expect(transactionBadges(row({ type: "credit", kind: "income" }))).toEqual([]);
  });

  it("marks a spend someone paid back and the money that paid it back", () => {
    expect(transactionBadges(row({ kind: "spend", offset_total: "1000.00" }))).toEqual(["paidBack"]);
    expect(transactionBadges(row({ type: "credit", kind: "income", offset_total: "500.00" }))).toEqual(["paysBack"]);
  });

  it("does not add a link badge when nothing is linked", () => {
    expect(transactionBadges(row({ kind: "spend", offset_total: "0.00" }))).toEqual([]);
  });

  it("shows a linked refund once, as Payback", () => {
    expect(transactionBadges(row({ type: "credit", kind: "payback", offset_total: "1000.00" }))).toEqual(["payback"]);
  });

  it("keeps transfer and review badges in order", () => {
    expect(transactionBadges(row({ kind: "transfer", needs_review: true }))).toEqual(["transfer", "review"]);
  });
});

describe("creditSummary", () => {
  it("says a fully linked credit is not income, with no ₹0 remainder", () => {
    const text = creditSummary("income", "1000.00", "0.00");
    expect(text).toContain("isn't income");
    expect(text).not.toContain("other");
  });

  it("says what is left of an income credit is income", () => {
    expect(creditSummary("income", "3000.00", "2000.00")).toContain("counts as income");
  });

  it("says what is left of a refund lowers spend", () => {
    expect(creditSummary("payback", "300.00", "200.00")).toContain("lowers your spend");
  });
});
