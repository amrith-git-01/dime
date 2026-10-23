import type { CounterpartyIncomeRow, CounterpartySpendRow } from "../../types";
import {
  buildCounterpartyDonutData,
  topPayeeKeysFromRows,
} from "../buildCounterpartyDonutData";

const donut = { slices: ["#a", "#b", "#c", "#d"], other: "#other" };

const incomeRows: CounterpartyIncomeRow[] = [
  { payee_key: "acme", display_name: "Acme", credit_total: "60000", share: 0.6, transaction_count: 1 },
  { payee_key: "bob", display_name: "Bob", credit_total: "25000", share: 0.25, transaction_count: 2 },
  { payee_key: "__other__", display_name: "Other", credit_total: "15000", share: 0.15, transaction_count: 3 },
];

describe("buildCounterpartyDonutData", () => {
  it("reads income rows, colours the top payers in order and greys Other", () => {
    const data = buildCounterpartyDonutData(incomeRows, donut);
    expect(data.map((d) => [d.display_name, d.amount, d.color])).toEqual([
      ["Acme", 60000, "#a"],
      ["Bob", 25000, "#b"],
      ["Other", 15000, "#other"],
    ]);
    expect(data[2]?.payee_key).toBe("__other__");
  });

  it("reads spend rows the same way", () => {
    const spend: CounterpartySpendRow[] = [
      { payee_key: "cafe", display_name: "Cafe", debit_total: "120.50", share: 1, transaction_count: 4 },
    ];
    const [slice] = buildCounterpartyDonutData(spend, donut);
    expect(slice?.amount).toBe(120.5);
    expect(slice?.transaction_count).toBe(4);
  });

  it("skips zero and unreadable amounts", () => {
    const rows: CounterpartyIncomeRow[] = [
      { payee_key: "a", display_name: "A", credit_total: "0", share: 0, transaction_count: 1 },
      { payee_key: "b", display_name: "B", credit_total: "x", share: 0, transaction_count: 1 },
    ];
    expect(buildCounterpartyDonutData(rows, donut)).toEqual([]);
  });
});

describe("topPayeeKeysFromRows", () => {
  it("lists the top keys without Other", () => {
    expect(topPayeeKeysFromRows(incomeRows)).toEqual(["acme", "bob"]);
  });
});
