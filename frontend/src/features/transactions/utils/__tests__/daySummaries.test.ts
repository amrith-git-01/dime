import type { InfiniteData } from "@tanstack/react-query";

import type {
  DayTransactionSummary,
  TransactionListPage,
  TransactionRow,
} from "../../types";
import { reconcileDaySummaries, resolveDaySummary } from "../daySummaries";

function tx(
  id: string,
  amount: string,
  type: "debit" | "credit",
  transaction_at: string,
): TransactionRow {
  return { id, amount, type, transaction_at } as TransactionRow;
}

function data(
  items: TransactionRow[],
  day_summaries?: Record<string, DayTransactionSummary>,
): InfiniteData<TransactionListPage> {
  return {
    pages: [{ items, has_more: false, day_summaries }],
    pageParams: [0],
  };
}

const DAY = "2026-10-13";
const NOON = "2026-10-13T12:00:00";

const summary = (
  debit: string,
  credit: string,
  count: number,
): DayTransactionSummary => ({
  date: DAY,
  debit_total: debit,
  credit_total: credit,
  net: (Number(credit) - Number(debit)).toFixed(2),
  transaction_count: count,
});

describe("reconcileDaySummaries", () => {
  it("adds an inserted row to a day that had no summary", () => {
    const prev = data([], {});
    const next = data([tx("a", "40.50", "debit", NOON)], {});

    const result = reconcileDaySummaries(prev, next);

    expect(result.pages[0].day_summaries?.[DAY]).toEqual({
      date: DAY,
      debit_total: "40.50",
      credit_total: "0.00",
      net: "-40.50",
      transaction_count: 1,
    });
  });

  it("drops the day when its last row is removed", () => {
    const row = tx("a", "10.00", "debit", NOON);
    const prev = data([row], { [DAY]: summary("10.00", "0.00", 1) });
    const next = data([]);

    const result = reconcileDaySummaries(prev, next);

    expect(result.pages[0].day_summaries).toEqual({});
  });

  it("re-totals an updated row", () => {
    const prev = data([tx("a", "10.00", "debit", NOON)], {
      [DAY]: summary("10.00", "0.00", 1),
    });
    const next = data([tx("a", "25.00", "credit", NOON)]);

    const result = reconcileDaySummaries(prev, next);

    expect(result.pages[0].day_summaries?.[DAY]).toMatchObject({
      debit_total: "0.00",
      credit_total: "25.00",
      net: "25.00",
      transaction_count: 1,
    });
  });

  it("leaves pages fetched without day totals alone", () => {
    const prev = data([]);
    const next = data([tx("a", "10.00", "debit", NOON)]);
    expect(reconcileDaySummaries(prev, next)).toBe(next);
  });
});

describe("resolveDaySummary", () => {
  const rows = [
    tx("a", "10.00", "debit", NOON),
    tx("b", "5.00", "credit", "2026-10-13T09:00:00"),
  ];

  it("is the server summary when it covers the loaded rows", () => {
    const server = summary("10.00", "5.00", 2);
    expect(resolveDaySummary(DAY, server, rows)).toBe(server);
  });

  it("rebuilds from loaded rows when the summary is missing", () => {
    expect(resolveDaySummary(DAY, undefined, rows)).toMatchObject({
      transaction_count: 2,
      debit_total: "10.00",
      credit_total: "5.00",
    });
  });

  it("rebuilds when the summary is behind the loaded rows", () => {
    expect(
      resolveDaySummary(DAY, summary("0.00", "0.00", 0), rows)
        ?.transaction_count,
    ).toBe(2);
  });

  it("is undefined for an empty day without a summary", () => {
    expect(resolveDaySummary(DAY, undefined, [])).toBeUndefined();
  });
});
