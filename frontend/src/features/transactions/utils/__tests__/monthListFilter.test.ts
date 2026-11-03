import { formatInrCompact } from "@/utils/currency";

import type { TransactionRow } from "../../types";
import {
  amountFilterLabel,
  applyListCriteria,
  buildCategoryOptions,
  buildListSections,
  buildPayeeOptions,
  computeListTotals,
  countActiveFilters,
  criteriaFromKind,
  criteriaFromSeed,
  criteriaNeedAllRows,
  DEFAULT_LIST_CRITERIA,
  describeSelection,
  filterTransactionsByMonthListKind,
  formatListTotalsLine,
  LIST_TYPE_FILTERS,
  LIST_TYPE_LABELS,
  listTypeFromKind,
  matchesListType,
  matchesMonthListKind,
  monthListKindOfType,
  stepMonthWithinBounds,
  toggleListCategory,
  toggleListPayee,
  withCategoryScopes,
} from "../monthListFilter";

type Row = Pick<TransactionRow, "type" | "category_scope">;

const rent: Row = { type: "debit", category_scope: "recurring_expense" };
const coffee: Row = { type: "debit", category_scope: "spend" };
const uncategorised: Row = { type: "debit", category_scope: null };
const unknownScope: Row = { type: "debit" };
const salary: Row = { type: "credit", category_scope: "recurring_income" };
const refund: Row = { type: "credit", category_scope: "spend" };

describe("matchesMonthListKind", () => {
  it("keeps every row for all", () => {
    for (const row of [rent, coffee, uncategorised, salary]) {
      expect(matchesMonthListKind(row, "all")).toBe(true);
    }
  });

  it("treats a debit in a recurring-scoped category as recurring", () => {
    expect(matchesMonthListKind(rent, "recurring")).toBe(true);
    expect(matchesMonthListKind(coffee, "recurring")).toBe(false);
    expect(matchesMonthListKind(uncategorised, "recurring")).toBe(false);
    expect(matchesMonthListKind(unknownScope, "recurring")).toBe(false);
  });

  it("never counts a credit as recurring or flexible", () => {
    expect(matchesMonthListKind(salary, "recurring")).toBe(false);
    expect(matchesMonthListKind(salary, "flexible")).toBe(false);
    expect(matchesMonthListKind(refund, "flexible")).toBe(false);
  });

  it("treats a debit with no category or a spend scope as flexible", () => {
    expect(matchesMonthListKind(coffee, "flexible")).toBe(true);
    expect(matchesMonthListKind(uncategorised, "flexible")).toBe(true);
    expect(matchesMonthListKind(unknownScope, "flexible")).toBe(true);
    expect(matchesMonthListKind(rent, "flexible")).toBe(false);
  });

  it("treats every credit as income and no debit", () => {
    expect(matchesMonthListKind(salary, "income")).toBe(true);
    expect(matchesMonthListKind(refund, "income")).toBe(true);
    expect(matchesMonthListKind(rent, "income")).toBe(false);
    expect(matchesMonthListKind(coffee, "income")).toBe(false);
  });
});

describe("filterTransactionsByMonthListKind", () => {
  const rows = [rent, coffee, salary, uncategorised] as TransactionRow[];

  it("returns the same array for all", () => {
    expect(filterTransactionsByMonthListKind(rows, "all")).toBe(rows);
  });

  it("narrows to the kind", () => {
    expect(filterTransactionsByMonthListKind(rows, "recurring")).toEqual([rent]);
    expect(filterTransactionsByMonthListKind(rows, "flexible")).toEqual([
      coffee,
      uncategorised,
    ]);
    expect(filterTransactionsByMonthListKind(rows, "income")).toEqual([salary]);
  });
});

describe("stepMonthWithinBounds", () => {
  const earliest = { year: 2025, monthIndex0: 11 };
  const latest = { year: 2026, monthIndex0: 10 };

  it("steps back across a year boundary", () => {
    expect(
      stepMonthWithinBounds({ year: 2026, monthIndex0: 0 }, -1, earliest, latest),
    ).toEqual({ year: 2025, monthIndex0: 11 });
  });

  it("steps forward across a year boundary", () => {
    expect(
      stepMonthWithinBounds({ year: 2025, monthIndex0: 11 }, 1, earliest, latest),
    ).toEqual({ year: 2026, monthIndex0: 0 });
  });

  it("stops at the earliest month", () => {
    expect(stepMonthWithinBounds(earliest, -1, earliest, latest)).toBeNull();
  });

  it("never goes beyond the current month", () => {
    expect(stepMonthWithinBounds(latest, 1, earliest, latest)).toBeNull();
  });
});

function tx(
  id: string,
  overrides: Partial<TransactionRow> = {},
): TransactionRow {
  return {
    id,
    type: "debit",
    amount: "100.00",
    merchant: "Shop",
    counterparty_name: null,
    note: null,
    category: null,
    category_id: null,
    category_scope: null,
    transaction_at: "2026-11-02T10:00:00.000Z",
    ...overrides,
  } as TransactionRow;
}

describe("list criteria", () => {
  it("maps a deep link's old kind onto the merged type", () => {
    expect(listTypeFromKind(undefined)).toBe("all");
    expect(listTypeFromKind("all")).toBe("all");
    expect(listTypeFromKind("recurring")).toBe("recurring");
    expect(listTypeFromKind("flexible")).toBe("flexible");
    expect(listTypeFromKind("income")).toBe("income");
    expect(LIST_TYPE_FILTERS.map((type) => LIST_TYPE_LABELS[type])).toEqual([
      "All",
      "Expense",
      "Income",
      "Recurring",
      "Flexible",
    ]);
    expect(criteriaFromKind(undefined)).toEqual(DEFAULT_LIST_CRITERIA);
    expect(criteriaFromKind("income")).toEqual({ ...DEFAULT_LIST_CRITERIA, type: "income" });
    expect(monthListKindOfType("income")).toBe("income");
    expect(monthListKindOfType("expense")).toBe("all");
  });

  it("seeds the filters from a category and payee", () => {
    expect(criteriaFromSeed({})).toEqual(DEFAULT_LIST_CRITERIA);
    expect(
      criteriaFromSeed({ kind: "flexible", categoryId: "c1", payee: " Swiggy " }),
    ).toEqual({
      ...DEFAULT_LIST_CRITERIA,
      type: "flexible",
      categoryIds: ["c1"],
      search: "Swiggy",
    });
  });

  it("toggles categories and payees", () => {
    const one = toggleListCategory(DEFAULT_LIST_CRITERIA, "a");
    expect(one.categoryIds).toEqual(["a"]);
    expect(toggleListCategory(one, "a").categoryIds).toEqual([]);
    const payee = toggleListPayee(DEFAULT_LIST_CRITERIA, "swiggy");
    expect(payee.payeeKeys).toEqual(["swiggy"]);
    expect(toggleListPayee(payee, "swiggy").payeeKeys).toEqual([]);
  });

  it("counts the filters that differ from the default", () => {
    expect(countActiveFilters(DEFAULT_LIST_CRITERIA)).toBe(0);
    expect(
      countActiveFilters({
        type: "expense",
        categoryIds: ["a", "b"],
        payeeKeys: ["x"],
        amountMinPaise: 100,
        amountMaxPaise: null,
        search: "  ",
        sort: "amount",
      }),
    ).toBe(5);
  });

  it("needs every page of the month only when a filter or sort is set", () => {
    expect(criteriaNeedAllRows(DEFAULT_LIST_CRITERIA)).toBe(false);
    expect(criteriaNeedAllRows({ ...DEFAULT_LIST_CRITERIA, categoryIds: ["a"] })).toBe(true);
    expect(criteriaNeedAllRows({ ...DEFAULT_LIST_CRITERIA, payeeKeys: ["a"] })).toBe(true);
    expect(criteriaNeedAllRows({ ...DEFAULT_LIST_CRITERIA, amountMaxPaise: 5 })).toBe(true);
    expect(criteriaNeedAllRows({ ...DEFAULT_LIST_CRITERIA, search: "x" })).toBe(true);
    expect(criteriaNeedAllRows({ ...DEFAULT_LIST_CRITERIA, sort: "oldest" })).toBe(true);
    expect(criteriaNeedAllRows(criteriaFromKind("income"))).toBe(true);
    expect(criteriaNeedAllRows({ ...DEFAULT_LIST_CRITERIA, search: "  " })).toBe(false);
  });

  describe("matchesListType", () => {
    it("Expense is every debit, Income every credit, All everything", () => {
      for (const row of [rent, coffee, uncategorised]) {
        expect(matchesListType(row, "expense")).toBe(true);
        expect(matchesListType(row, "income")).toBe(false);
        expect(matchesListType(row, "all")).toBe(true);
      }
      expect(matchesListType(salary, "expense")).toBe(false);
      expect(matchesListType(salary, "income")).toBe(true);
    });

    it("Recurring and Flexible are the two kinds of debit, so they cannot contradict Income", () => {
      expect(matchesListType(rent, "recurring")).toBe(true);
      expect(matchesListType(rent, "flexible")).toBe(false);
      expect(matchesListType(coffee, "flexible")).toBe(true);
      expect(matchesListType(salary, "recurring")).toBe(false);
      expect(matchesListType(salary, "flexible")).toBe(false);
    });
  });

  describe("applyListCriteria", () => {
    const rows = [
      tx("rent", { category_id: "c-rent", category_scope: "recurring_expense", merchant: "Landlord", counterparty_name: "Landlord", amount: "15000.00" }),
      tx("tea", { category_id: "c-food", category_scope: "spend", note: "Masala TEA", counterparty_name: "Chai Point", amount: "120.00" }),
      tx("loose", { category_scope: null, counterparty_name: "Swiggy", amount: "500.00" }),
      tx("swiggy2", { category_scope: "spend", counterparty_name: "Swiggy India", counterparty_normalized: "swiggy", amount: "2000.00" }),
      tx("pay", { type: "credit", category_id: "c-sal", category_scope: "recurring_income", counterparty_name: "Acme", amount: "50000.00" }),
    ];
    const ids = (c: Partial<typeof DEFAULT_LIST_CRITERIA>) =>
      applyListCriteria(rows, { ...DEFAULT_LIST_CRITERIA, ...c }).map((r) => r.id);

    it("filters by the merged type", () => {
      expect(ids({})).toEqual(["rent", "tea", "loose", "swiggy2", "pay"]);
      expect(ids({ type: "expense" })).toEqual(["rent", "tea", "loose", "swiggy2"]);
      expect(ids({ type: "income" })).toEqual(["pay"]);
      expect(ids({ type: "recurring" })).toEqual(["rent"]);
      expect(ids({ type: "flexible" })).toEqual(["tea", "loose", "swiggy2"]);
    });

    it("filters by category, including uncategorized", () => {
      expect(ids({ categoryIds: ["c-food", "__uncategorized__"] })).toEqual(["tea", "loose", "swiggy2"]);
    });

    it("filters by payee key, matching with the shared payee key helper", () => {
      // "Swiggy" has no stored key (derived), "Swiggy India" carries counterparty_normalized "swiggy".
      expect(ids({ payeeKeys: ["swiggy"] })).toEqual(["loose", "swiggy2"]);
      expect(ids({ payeeKeys: ["landlord", "acme"] })).toEqual(["rent", "pay"]);
      expect(ids({ payeeKeys: ["nobody"] })).toEqual([]);
    });

    it("filters by an inclusive amount range, either side optional", () => {
      expect(ids({ amountMinPaise: 50_000 })).toEqual(["rent", "loose", "swiggy2", "pay"]);
      expect(ids({ amountMaxPaise: 50_000 })).toEqual(["tea", "loose"]);
      expect(ids({ amountMinPaise: 50_000, amountMaxPaise: 200_000 })).toEqual(["loose", "swiggy2"]);
      expect(ids({ amountMinPaise: 12_000, amountMaxPaise: 12_000 })).toEqual(["tea"]);
    });

    it("searches the payee and the note, ignoring case and surrounding spaces", () => {
      expect(ids({ search: " tea " })).toEqual(["tea"]);
      expect(ids({ search: "LANDLORD" })).toEqual(["rent"]);
      expect(ids({ search: "chai" })).toEqual(["tea"]);
      expect(ids({ search: "swiggy" })).toEqual(["loose", "swiggy2"]);
    });

    it("combines the filters", () => {
      expect(ids({ type: "expense", search: "swiggy", amountMinPaise: 100_000 })).toEqual(["swiggy2"]);
      expect(ids({ type: "income", search: "landlord" })).toEqual([]);
    });
  });

  describe("amount filter label", () => {
    it("names the range, or the one open side", () => {
      expect(amountFilterLabel(DEFAULT_LIST_CRITERIA)).toBe("Amount");
      expect(amountFilterLabel({ ...DEFAULT_LIST_CRITERIA, amountMinPaise: 50_000 })).toBe(`${formatInrCompact(500)}+`);
      expect(amountFilterLabel({ ...DEFAULT_LIST_CRITERIA, amountMinPaise: 70_000, amountMaxPaise: 300_000 })).toBe(`${formatInrCompact(700)} – ${formatInrCompact(3000)}`);
      expect(amountFilterLabel({ ...DEFAULT_LIST_CRITERIA, amountMaxPaise: 100_000 })).toBe(`Up to ${formatInrCompact(1000)}`);
    });
  });

  describe("buildCategoryOptions", () => {
    it("offers Uncategorized and the given spending categories only, once each", () => {
      expect(
        buildCategoryOptions([
          { id: "c-food", name: "Food" },
          { id: "c-food", name: "Food again" },
          { id: "c-fun", name: "Fun" },
        ]),
      ).toEqual([
        { id: "__uncategorized__", name: "Uncategorized" },
        { id: "c-food", name: "Food" },
        { id: "c-fun", name: "Fun" },
      ]);
      expect(buildCategoryOptions([])).toEqual([{ id: "__uncategorized__", name: "Uncategorized" }]);
    });

    it("adds a selected id outside the list, once, so it can be unticked", () => {
      const names: Record<string, string> = { "c-rent": "Rent" };
      expect(
        buildCategoryOptions([{ id: "c-food", name: "Food" }], ["c-food", "c-rent", "c-gone"], (id) => names[id]),
      ).toEqual([
        { id: "__uncategorized__", name: "Uncategorized" },
        { id: "c-food", name: "Food" },
        { id: "c-rent", name: "Rent" },
        { id: "c-gone", name: "Category" },
      ]);
    });
  });

  it("describes a multi-select for the chip and for screen readers", () => {
    expect(describeSelection([])).toEqual({ label: "", spoken: "" });
    expect(describeSelection(["Food"])).toEqual({ label: "Food", spoken: "Food" });
    expect(describeSelection(["Food", "Rent", "Fun"])).toEqual({
      label: "Food +2",
      spoken: "Food and 2 more",
    });
  });
});

describe("payee options", () => {
  it("lists the payees in the rows, most transactions first, then the larger total", () => {
    const rows = [
      tx("a", { counterparty_name: "Swiggy", amount: "100.00" }),
      tx("b", { counterparty_name: "Swiggy", amount: "50.00" }),
      tx("c", { counterparty_name: "Uber", amount: "900.00" }),
      tx("d", { counterparty_name: "Chai Point", amount: "20.00" }),
      tx("e", { counterparty_name: "Uber Eats", counterparty_normalized: "uber", amount: "1.00" }),
    ];
    expect(buildPayeeOptions(rows)).toEqual([
      { key: "uber", name: "Uber", count: 2, totalPaise: 90_100 },
      { key: "swiggy", name: "Swiggy", count: 2, totalPaise: 15_000 },
      { key: "chai point", name: "Chai Point", count: 1, totalPaise: 2_000 },
    ].sort((a, b) => b.count - a.count || b.totalPaise - a.totalPaise));
  });

  it("falls back to the merchant, then Unknown", () => {
    const rows = [
      tx("a", { counterparty_name: null, merchant: "Corner Shop" }),
      tx("b", { counterparty_name: null, merchant: "" }),
    ];
    expect(buildPayeeOptions(rows).map((o) => o.name).sort()).toEqual(["Corner Shop", "Unknown"]);
  });
});

describe("list totals", () => {
  const rows = [
    tx("a", { amount: "100.50" }),
    tx("b", { amount: "399.50" }),
    tx("c", { type: "credit", amount: "1000.00" }),
  ];

  it("adds up what was spent and what was received", () => {
    expect(computeListTotals(rows)).toEqual({ count: 3, spentPaise: 50_000, receivedPaise: 100_000 });
    expect(computeListTotals([])).toEqual({ count: 0, spentPaise: 0, receivedPaise: 0 });
  });

  it("formats the line, leaving out zero parts", () => {
    expect(formatListTotalsLine({ count: 24, spentPaise: 950_900, receivedPaise: 5_833_300 })).toBe(
      `24 transactions · ${formatInrCompact(9509)} spent · ${formatInrCompact(58333)} received`,
    );
    expect(formatListTotalsLine({ count: 3, spentPaise: 50_000, receivedPaise: 0 })).toBe(
      `3 transactions · ${formatInrCompact(500)} spent`,
    );
    expect(formatListTotalsLine({ count: 2, spentPaise: 0, receivedPaise: 100_000 })).toBe(
      `2 transactions · ${formatInrCompact(1000)} received`,
    );
    expect(formatListTotalsLine({ count: 0, spentPaise: 0, receivedPaise: 0 })).toBe("0 transactions");
  });

  it("says '1 transaction' for one", () => {
    expect(formatListTotalsLine({ count: 1, spentPaise: 12_000, receivedPaise: 0 })).toBe(
      `1 transaction · ${formatInrCompact(120)} spent`,
    );
  });

  it("marks a partial count with + and leaves the money out until every page is loaded", () => {
    expect(formatListTotalsLine({ count: 20, spentPaise: 10_000, receivedPaise: 0 }, true)).toBe(
      "20+ transactions",
    );
    expect(formatListTotalsLine({ count: 1, spentPaise: 0, receivedPaise: 0 }, true)).toBe(
      "1+ transactions",
    );
  });
});

describe("buildListSections", () => {
  const rows = [
    tx("a", { transaction_at: "2026-11-02T11:00:00.000Z", amount: "50.00" }),
    tx("b", { transaction_at: "2026-11-02T13:00:00.000Z", amount: "10.00" }),
    tx("c", { transaction_at: "2026-10-30T12:00:00.000Z", amount: "900.00" }),
  ];

  it("lists days and rows newest first", () => {
    const sections = buildListSections(rows, "newest");
    expect(sections.map((s) => s.data.map((r) => r.id))).toEqual([["b", "a"], ["c"]]);
  });

  it("lists days and rows oldest first", () => {
    const sections = buildListSections(rows, "oldest");
    expect(sections.map((s) => s.data.map((r) => r.id))).toEqual([["c"], ["a", "b"]]);
  });

  it("ranks by amount in one section", () => {
    const sections = buildListSections(rows, "amount");
    expect(sections).toHaveLength(1);
    expect(sections[0].data.map((r) => r.id)).toEqual(["c", "a", "b"]);
  });

  it("returns no sections for no rows", () => {
    expect(buildListSections([], "amount")).toEqual([]);
    expect(buildListSections([], "oldest")).toEqual([]);
  });
});

describe("withCategoryScopes", () => {
  const scopes = new Map([["c-rent", "recurring_expense" as const]]);

  it("fills a missing scope from the category", () => {
    const [row] = withCategoryScopes([tx("p", { category_id: "c-rent" })], scopes);
    expect(row.category_scope).toBe("recurring_expense");
    expect(matchesMonthListKind(row, "recurring")).toBe(true);
  });

  it("leaves rows with a scope, no category or an unknown category alone", () => {
    const rows = [
      tx("a", { category_id: "c-rent", category_scope: "spend" }),
      tx("b", { category_id: null }),
      tx("c", { category_id: "other" }),
    ];
    const out = withCategoryScopes(rows, scopes);
    expect(out[0].category_scope).toBe("spend");
    expect(out[1]).toBe(rows[1]);
    expect(out[2]).toBe(rows[2]);
  });
});
