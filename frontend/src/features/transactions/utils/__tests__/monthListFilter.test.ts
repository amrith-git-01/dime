import type { TransactionRow } from "../../types";
import {
  activeKindChip,
  applyKindChip,
  applyListCriteria,
  buildListSections,
  countActiveFilters,
  criteriaFromKind,
  criteriaFromSeed,
  criteriaNeedAllRows,
  DEFAULT_LIST_CRITERIA,
  filterTransactionsByMonthListKind,
  matchesMonthListKind,
  setListKind,
  setListType,
  stepMonthWithinBounds,
  toggleListCategory,
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
  it("maps chips to type and kind and back", () => {
    expect(criteriaFromKind(undefined)).toEqual(DEFAULT_LIST_CRITERIA);
    expect(criteriaFromKind("recurring")).toMatchObject({ type: "debit", kind: "recurring" });
    expect(criteriaFromKind("income")).toMatchObject({ type: "credit", kind: "all" });
    expect(activeKindChip(criteriaFromKind("flexible"))).toBe("flexible");
    expect(activeKindChip(setListType(DEFAULT_LIST_CRITERIA, "debit"))).toBeNull();
  });

  it("seeds the filters from a category and payee", () => {
    expect(criteriaFromSeed({})).toEqual(DEFAULT_LIST_CRITERIA);
    expect(
      criteriaFromSeed({ kind: "flexible", categoryId: "c1", payee: " Swiggy " }),
    ).toEqual({
      ...DEFAULT_LIST_CRITERIA,
      type: "debit",
      kind: "flexible",
      categoryIds: ["c1"],
      search: "Swiggy",
    });
  });

  it("keeps categories, search and sort when a chip is picked", () => {
    const base = { ...DEFAULT_LIST_CRITERIA, categoryIds: ["c1"], search: "tea", sort: "oldest" as const };
    expect(applyKindChip(base, "income")).toEqual({
      ...base,
      type: "credit",
      kind: "all",
    });
  });

  it("keeps type and kind consistent", () => {
    const received = setListType(
      { ...DEFAULT_LIST_CRITERIA, kind: "recurring" },
      "credit",
    );
    expect(received.kind).toBe("all");
    expect(setListKind(received, "flexible")).toMatchObject({
      type: "all",
      kind: "flexible",
    });
    expect(setListKind(setListType(DEFAULT_LIST_CRITERIA, "debit"), "recurring").type).toBe("debit");
  });

  it("toggles categories", () => {
    const one = toggleListCategory(DEFAULT_LIST_CRITERIA, "a");
    expect(one.categoryIds).toEqual(["a"]);
    expect(toggleListCategory(one, "a").categoryIds).toEqual([]);
  });

  it("counts the filters that differ from the default", () => {
    expect(countActiveFilters(DEFAULT_LIST_CRITERIA)).toBe(0);
    expect(
      countActiveFilters({
        type: "debit",
        kind: "flexible",
        categoryIds: ["a", "b"],
        search: "  ",
        sort: "amount",
      }),
    ).toBe(4);
  });

  it("needs every page of the month only when a filter or sort is set", () => {
    expect(criteriaNeedAllRows(DEFAULT_LIST_CRITERIA)).toBe(false);
    expect(criteriaNeedAllRows({ ...DEFAULT_LIST_CRITERIA, categoryIds: ["a"] })).toBe(true);
    expect(criteriaNeedAllRows({ ...DEFAULT_LIST_CRITERIA, search: "x" })).toBe(true);
    expect(criteriaNeedAllRows({ ...DEFAULT_LIST_CRITERIA, sort: "oldest" })).toBe(true);
    expect(criteriaNeedAllRows(criteriaFromKind("income"))).toBe(true);
    expect(criteriaNeedAllRows({ ...DEFAULT_LIST_CRITERIA, search: "  " })).toBe(false);
  });

  it("filters rows by type, kind, category and search together", () => {
    const rows = [
      tx("rent", { category_id: "c-rent", category_scope: "recurring_expense", merchant: "Landlord" }),
      tx("tea", { category_id: "c-food", category_scope: "spend", note: "Masala TEA" }),
      tx("loose", { category_scope: null }),
      tx("pay", { type: "credit", category_id: "c-sal", category_scope: "recurring_income" }),
    ];
    const ids = (c: Partial<typeof DEFAULT_LIST_CRITERIA>) =>
      applyListCriteria(rows, { ...DEFAULT_LIST_CRITERIA, ...c }).map((r) => r.id);
    expect(ids({})).toEqual(["rent", "tea", "loose", "pay"]);
    expect(ids({ type: "credit" })).toEqual(["pay"]);
    expect(ids({ kind: "recurring" })).toEqual(["rent"]);
    expect(ids({ kind: "flexible" })).toEqual(["tea", "loose"]);
    expect(ids({ categoryIds: ["c-food", "__uncategorized__"] })).toEqual(["tea", "loose"]);
    expect(ids({ search: " tea " })).toEqual(["tea"]);
    expect(ids({ search: "landlord", type: "debit" })).toEqual(["rent"]);
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
