import type { TransactionRow } from "../../types";
import {
  flattenTransactionListSections,
  type TransactionListSection,
} from "../buildTransactionFlashListData";

function tx(id: string): TransactionRow {
  return { id } as TransactionRow;
}

describe("flattenTransactionListSections", () => {
  const sections: TransactionListSection[] = [
    { key: "2026-08-15", title: "Today", data: [tx("a"), tx("b")] },
    { key: "2026-08-14", title: "Yesterday", data: [tx("c")] },
  ];

  it("emits a header item before each section's rows", () => {
    const items = flattenTransactionListSections(sections, {
      "2026-08-15": -30,
      "2026-08-14": 5,
    });

    expect(items.map((item) => item.id)).toEqual([
      "header:2026-08-15",
      "a",
      "b",
      "header:2026-08-14",
      "c",
    ]);
    expect(items[0]).toMatchObject({
      kind: "header",
      dayKey: "2026-08-15",
      title: "Today",
      netTotal: -30,
    });
    expect(items[3]).toMatchObject({ kind: "header", netTotal: 5 });
  });

  it("marks first and last rows within each section", () => {
    const items = flattenTransactionListSections(sections, {});
    expect(items[1]).toMatchObject({
      isFirstInSection: true,
      isLastInSection: false,
    });
    expect(items[2]).toMatchObject({
      isFirstInSection: false,
      isLastInSection: true,
    });
    expect(items[4]).toMatchObject({
      isFirstInSection: true,
      isLastInSection: true,
    });
  });

  it("returns nothing for no sections", () => {
    expect(flattenTransactionListSections([], {})).toEqual([]);
  });
});
