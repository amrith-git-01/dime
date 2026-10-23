import type { TransactionRow } from "../../types";
import { filterTransactionsByPayee } from "../payeeKey";

const tx = (
  id: string,
  type: "debit" | "credit",
  normalized: string,
): TransactionRow =>
  ({
    id,
    type,
    counterparty_normalized: normalized,
    counterparty_name: normalized,
    merchant: normalized,
  }) as TransactionRow;

const rows = [
  tx("d-cafe", "debit", "cafe"),
  tx("c-cafe", "credit", "cafe"),
  tx("c-acme", "credit", "acme"),
  tx("c-other", "credit", "zed"),
  tx("d-other", "debit", "zed"),
];

const ids = (list: TransactionRow[]) => list.map((r) => r.id);

describe("filterTransactionsByPayee", () => {
  it("keeps only debits by default", () => {
    expect(ids(filterTransactionsByPayee(rows, "cafe"))).toEqual(["d-cafe"]);
  });

  it("keeps only credits for the credit direction", () => {
    expect(ids(filterTransactionsByPayee(rows, "cafe", [], "credit"))).toEqual([
      "c-cafe",
    ]);
  });

  it("resolves Other against the top keys of the same direction", () => {
    expect(
      ids(filterTransactionsByPayee(rows, "__other__", ["acme", "cafe"], "credit")),
    ).toEqual(["c-other"]);
    expect(
      ids(filterTransactionsByPayee(rows, "__other__", ["cafe"])),
    ).toEqual(["d-other"]);
  });
});
