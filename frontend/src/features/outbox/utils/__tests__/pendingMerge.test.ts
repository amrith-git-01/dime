import { manualItem, NOW, voiceItem } from "@/lib/outbox/__tests__/fixtures";
import type { DayTransactionSummary, TransactionRow } from "@/features/transactions/types";

import {
  addPaiseToAmount,
  addPendingToDaySummaries,
  addPendingToMonthTotals,
  isPendingTransactionRow,
  mergePendingRecent,
  pendingInMonth,
  pendingOnDay,
  pendingRowFromItem,
  pendingRowsFromItems,
  pendingTotals,
} from "../pendingMerge";

function pendingAt(id: string, transactionAt: string, amount = "100.00", type: "debit" | "credit" = "debit") {
  const item = manualItem({ id });
  const row = pendingRowFromItem(
    { ...item, preview: { ...item.preview!, transaction_at: transactionAt, amount, type } },
    "u1",
  );
  if (!row) throw new Error("expected a row");
  return row;
}

function serverRow(id: string, transactionAt: string): TransactionRow {
  return { ...pendingAt(id, transactionAt), id, pending: undefined } as unknown as TransactionRow;
}

describe("pendingRowFromItem", () => {
  it("maps a manual item to a row marked pending, with the category display fields", () => {
    const row = pendingRowFromItem(manualItem(), "u1");
    expect(row).toMatchObject({
      id: "optimistic-manual-1",
      outboxId: "optimistic-manual-1",
      pending: true,
      user_id: "u1",
      amount: "250.00",
      type: "debit",
      merchant: "Swiggy",
      counterparty_name: "Swiggy",
      category: "Food",
      category_icon_name: "Utensils",
      category_color: "teal",
      detected_via: "manual",
      transaction_at: "2026-10-23T09:30:00.000Z",
      deleted_at: null,
    });
    expect(isPendingTransactionRow(row!)).toBe(true);
  });

  it("voice and receipt items have no row (they live in the Pending sheet only)", () => {
    expect(pendingRowFromItem(voiceItem(), "u1")).toBeNull();
    expect(pendingRowsFromItems([voiceItem(), manualItem()], "u1")).toHaveLength(1);
    expect(pendingRowsFromItems([manualItem()], null)).toEqual([]);
  });

  it("server rows are not pending", () => {
    expect(isPendingTransactionRow(serverRow("s1", "2026-10-23T08:00:00.000Z"))).toBe(false);
  });
});

describe("mergePendingRecent", () => {
  const server = [
    serverRow("s1", "2026-10-23T08:00:00.000Z"),
    serverRow("s2", "2026-10-22T08:00:00.000Z"),
    serverRow("s3", "2026-10-21T08:00:00.000Z"),
  ];

  it("returns the server rows (cut to the limit) when nothing is pending", () => {
    expect(mergePendingRecent(server, [], 2).map((r) => r.id)).toEqual(["s1", "s2"]);
  });

  it("puts pending rows in by date, newest first, then cuts to the limit", () => {
    const merged = mergePendingRecent(
      server,
      [pendingAt("p-new", "2026-10-23T09:30:00.000Z"), pendingAt("p-old", "2026-10-20T09:30:00.000Z")],
      4,
    );
    expect(merged.map((r) => r.id)).toEqual(["p-new", "s1", "s2", "s3"]);
  });
});

describe("month and day selection", () => {
  const rows = [
    pendingAt("oct", "2026-10-23T09:30:00.000Z"),
    pendingAt("sep", "2026-09-30T09:30:00.000Z"),
  ];

  it("pendingInMonth uses the 0-based month index", () => {
    expect(pendingInMonth(rows, 2026, 9).map((r) => r.id)).toEqual(["oct"]);
    expect(pendingInMonth(rows, 2026, 8).map((r) => r.id)).toEqual(["sep"]);
  });

  it("pendingOnDay matches the local calendar day key of the row", () => {
    const key = (iso: string) => {
      const d = new Date(iso);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    expect(pendingOnDay(rows, key("2026-10-23T09:30:00.000Z")).map((r) => r.id)).toEqual(["oct"]);
    expect(pendingOnDay(rows, "1999-01-01")).toEqual([]);
  });
});

describe("totals", () => {
  const rows = [
    pendingAt("a", "2026-10-23T09:30:00.000Z", "250.50", "debit"),
    pendingAt("b", "2026-10-23T10:30:00.000Z", "99.99", "debit"),
    pendingAt("c", "2026-10-23T11:30:00.000Z", "1000.00", "credit"),
  ];

  it("sums debits and credits exactly in paise", () => {
    expect(pendingTotals(rows)).toEqual({ debitPaise: 35049, creditPaise: 100000, count: 3 });
  });

  it("adds them to the server's month totals and leaves them alone when nothing is pending", () => {
    const totals = { debit_total: "1000.00", credit_total: "5000.00", net: "4000.00", transaction_count: 7 };
    expect(addPendingToMonthTotals(totals, pendingTotals(rows))).toEqual({
      debit_total: "1350.49",
      credit_total: "6000.00",
      net: "4649.51",
      transaction_count: 10,
    });
    expect(addPendingToMonthTotals(totals, pendingTotals([]))).toBe(totals);
  });

  it("keeps the sign of a small negative net", () => {
    expect(addPaiseToAmount("0.00", -50)).toBe("-0.50");
    expect(addPaiseToAmount("10.00", -1050)).toBe("-0.50");
    expect(addPaiseToAmount(undefined, 250)).toBe("2.50");
  });
});

describe("addPendingToDaySummaries", () => {
  const day = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  it("adds pending amounts to their day, creating a day that had no summary", () => {
    const at = "2026-10-23T09:30:00.000Z";
    const key = day(new Date(at));
    const existing: Record<string, DayTransactionSummary> = {
      [key]: { date: key, credit_total: "0.00", debit_total: "100.00", net: "-100.00", transaction_count: 2 },
    };
    const merged = addPendingToDaySummaries(existing, [pendingAt("a", at, "50.00"), pendingAt("b", "2026-01-05T09:30:00.000Z", "10.00", "credit")]);
    expect(merged[key]).toMatchObject({ debit_total: "150.00", net: "-150.00", transaction_count: 3 });
    const janKey = day(new Date("2026-01-05T09:30:00.000Z"));
    expect(merged[janKey]).toMatchObject({ credit_total: "10.00", debit_total: "0.00", net: "10.00", transaction_count: 1 });
    // The server's map is not mutated.
    expect(existing[key]?.transaction_count).toBe(2);
  });

  it("returns the same map when nothing is pending", () => {
    const empty = {};
    expect(addPendingToDaySummaries(empty, [])).toBe(empty);
  });
});

describe("fixtures sanity", () => {
  it("NOW is the fixed clock the outbox tests use", () => {
    expect(new Date(NOW).toISOString()).toBe("2026-10-23T10:00:00.000Z");
  });
});
