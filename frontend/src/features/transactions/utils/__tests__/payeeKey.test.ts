import type { TransactionRow } from "../../types";
import { filterTransactionsByPayee, normalizePayeeKey } from "../payeeKey";

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

describe("normalizePayeeKey (same rule as the API's normalizeCounterparty)", () => {
  it.each([
    ["  Cafe  Coffee-Day! ", "cafe coffee day"],
    ["Swiggy*Instamart #12", "swiggy instamart 12"],
    ["@@!!", "unknown"],
    ["", "unknown"],
  ])("ASCII %j -> %j", (raw, key) => {
    expect(normalizePayeeKey(raw)).toBe(key);
  });

  it.each([
    ["காய்கறி கடை", "காய்கறி கடை"],
    ["राम-श्याम", "राम श्याम"],
    ["Café Zürich", "café zürich"],
    ["张伟", "张伟"],
  ])("keeps letters and combining marks of any script: %j", (raw, key) => {
    expect(normalizePayeeKey(raw)).toBe(key);
  });
});
