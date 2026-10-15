import type { RecurringOccurrence } from "@/features/recurring/types";

import type { TransactionRow } from "../../types";
import {
  buildTransactionFlashListItemsForSingleDay,
  groupUpcomingByDay,
} from "../buildTransactionFlashListData";

const NOW = new Date(2026, 9, 15, 10, 0, 0); // Thu 15 Oct 2026, local

const occ = (over: Partial<RecurringOccurrence>): RecurringOccurrence => ({
  id: "rent",
  kind: "subscription",
  name: "Rent",
  amount: "15000.00",
  category: null,
  due_date: "2026-10-20",
  status: "upcoming",
  ...over,
});

function tx(id: string, at: string): TransactionRow {
  return {
    id,
    user_id: "u",
    amount: "10.00",
    type: "debit",
    counterparty_name: "Shop",
    counterparty_type: "merchant",
    counterparty_normalized: null,
    merchant: "Shop",
    category: null,
    category_id: null,
    category_icon_name: null,
    category_color: null,
    note: null,
    detected_via: null,
    transaction_at: at,
    created_at: at,
    updated_at: at,
    deleted_at: null,
    receipt_url: null,
    voice_url: null,
  };
}

describe("groupUpcomingByDay", () => {
  it("keeps upcoming occurrences from today on, grouped by due day", () => {
    const grouped = groupUpcomingByDay(
      [
        occ({ id: "a", due_date: "2026-10-14" }), // past: not shown as upcoming
        occ({ id: "b", due_date: "2026-10-15" }), // today
        occ({ id: "c", due_date: "2026-10-20" }),
        occ({ id: "d", due_date: "2026-10-20", name: "Gym" }),
        occ({ id: "e", due_date: "2026-10-25", status: "paid" }),
        occ({ id: "f", due_date: "2026-10-26", status: "skipped" }),
      ],
      NOW,
    );
    expect(Object.keys(grouped)).toEqual(["2026-10-15", "2026-10-20"]);
    expect(grouped["2026-10-20"].map((o) => o.id)).toEqual(["c", "d"]);
    expect(groupUpcomingByDay(undefined, NOW)).toEqual({});
  });
});

describe("buildTransactionFlashListItemsForSingleDay", () => {
  const rows = [
    tx("t1", "2026-10-20T04:00:00.000Z"),
    tx("t2", "2026-10-20T06:00:00.000Z"),
  ];

  it("appends ghost rows after the real rows on a future day", () => {
    const items = buildTransactionFlashListItemsForSingleDay(
      rows,
      "2026-10-20",
      [occ({})],
      NOW,
    );
    expect(items.map((i) => [i.kind, i.sectionRowIndex])).toEqual([
      ["row", 0],
      ["row", 1],
      ["upcoming", 2],
    ]);
    expect(items.filter((i) => i.kind === "row")).toHaveLength(2);
  });

  it("shows a ghost on a day with no real rows, and on today", () => {
    expect(
      buildTransactionFlashListItemsForSingleDay([], "2026-10-20", [occ({})], NOW).map(
        (i) => i.kind,
      ),
    ).toEqual(["upcoming"]);
    expect(
      buildTransactionFlashListItemsForSingleDay(
        [],
        "2026-10-15",
        [occ({ due_date: "2026-10-15" })],
        NOW,
      ).map((i) => i.kind),
    ).toEqual(["upcoming"]);
  });

  it("never adds ghost rows to a past day, nor ones due on another day or not upcoming", () => {
    const past = buildTransactionFlashListItemsForSingleDay(
      [],
      "2026-10-14",
      [occ({ due_date: "2026-10-14" })],
      NOW,
    );
    expect(past).toEqual([]);
    const other = buildTransactionFlashListItemsForSingleDay(
      [],
      "2026-10-21",
      [occ({}), occ({ id: "x", due_date: "2026-10-21", status: "paid" })],
      NOW,
    );
    expect(other).toEqual([]);
  });

  it("without upcoming input it is the same list of real rows as before", () => {
    expect(
      buildTransactionFlashListItemsForSingleDay(
        rows,
        "2026-10-20",
        undefined,
        NOW,
      ).every((i) => i.kind === "row"),
    ).toBe(true);
  });
});
