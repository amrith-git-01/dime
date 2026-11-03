import { formatInrCompact } from "@/utils/currency";
import { toPaise } from "@/utils/paise";

import { UNCATEGORIZED_CATEGORY_KEY } from "../constants/uncategorizedCategoryKey";
import type { CategoryScope, TransactionRow } from "../types";

import { transactionPayeeKey } from "./payeeKey";

import {
  groupTransactionsByCalendarDay,
  type TransactionListSection,
} from "./buildTransactionFlashListData";

/** What the month list narrows to: everything, or one slice of the month's money. */
export type MonthListKind = "all" | "recurring" | "flexible" | "income";

/**
 * Whether a row belongs to the kind. Mirrors the API's split (IS_FIXED =
 * COALESCE(scope, 'spend') <> 'spend'): recurring is a debit in a recurring-scoped category,
 * flexible is a debit with no category or a "spend" one, income is any credit.
 */
export function matchesMonthListKind(
  row: Pick<TransactionRow, "type" | "category_scope">,
  kind: MonthListKind,
): boolean {
  switch (kind) {
    case "all":
      return true;
    case "income":
      return row.type === "credit";
    case "recurring":
      return (
        row.type === "debit" &&
        row.category_scope != null &&
        row.category_scope !== "spend"
      );
    case "flexible":
      return (
        row.type === "debit" &&
        (row.category_scope == null || row.category_scope === "spend")
      );
  }
}

export type MonthRef = { year: number; monthIndex0: number };

/**
 * The month `delta` steps from `from` (negative = earlier), or null when that would leave the
 * window: no earlier than `earliest`, never beyond `latest` (the current month).
 */
export function stepMonthWithinBounds(
  from: MonthRef,
  delta: -1 | 1,
  earliest: MonthRef,
  latest: MonthRef,
): MonthRef | null {
  const index = (m: MonthRef) => m.year * 12 + m.monthIndex0;
  const target = index(from) + delta;
  if (target < index(earliest) || target > index(latest)) {
    return null;
  }
  return { year: Math.floor(target / 12), monthIndex0: target % 12 };
}

export function filterTransactionsByMonthListKind(
  rows: TransactionRow[],
  kind: MonthListKind,
): TransactionRow[] {
  return kind === "all" ? rows : rows.filter((row) => matchesMonthListKind(row, kind));
}

// ---------------------------------------------------------------------------
// The general list's filters: type, categories, payees, amount, text search and sort.
// ---------------------------------------------------------------------------

/**
 * One merged "type": Expense is every debit, Recurring and Flexible are the two kinds of debit,
 * Income is every credit. A single value, so contradictory combinations cannot exist; "all" is
 * the no-filter state.
 */
export type ListTypeFilter = "all" | "expense" | "recurring" | "flexible" | "income";
export type ListSort = "newest" | "oldest" | "amount";

export const LIST_TYPE_FILTERS: readonly ListTypeFilter[] = [
  "all",
  "expense",
  "income",
  "recurring",
  "flexible",
];

export const LIST_TYPE_LABELS: Record<ListTypeFilter, string> = {
  all: "All",
  expense: "Expense",
  income: "Income",
  recurring: "Recurring",
  flexible: "Flexible",
};

export const LIST_SORT_LABELS: Record<ListSort, string> = {
  newest: "Newest",
  oldest: "Oldest",
  amount: "Highest amount",
};

export type ListCriteria = {
  type: ListTypeFilter;
  /** Category ids (or {@link UNCATEGORIZED_CATEGORY_KEY}); empty = every category. */
  categoryIds: string[];
  /** Payee keys (see `transactionPayeeKey`); empty = every payee. */
  payeeKeys: string[];
  /** Inclusive amount bounds in paise (absolute amounts); null = no bound on that side. */
  amountMinPaise: number | null;
  amountMaxPaise: number | null;
  search: string;
  sort: ListSort;
};

export const DEFAULT_LIST_CRITERIA: ListCriteria = {
  type: "all",
  categoryIds: [],
  payeeKeys: [],
  amountMinPaise: null,
  amountMaxPaise: null,
  search: "",
  sort: "newest",
};

/** The type a deep link's old `kind` value (all / recurring / flexible / income) stands for. */
export function listTypeFromKind(kind: MonthListKind | undefined): ListTypeFilter {
  return kind ?? "all";
}

export function criteriaFromKind(kind: MonthListKind | undefined): ListCriteria {
  return { ...DEFAULT_LIST_CRITERIA, type: listTypeFromKind(kind) };
}

/** The starting filters for a list opened from elsewhere (a link, a category, a payee). */
export function criteriaFromSeed(seed: {
  kind?: MonthListKind;
  categoryId?: string;
  payee?: string;
}): ListCriteria {
  return {
    ...criteriaFromKind(seed.kind),
    categoryIds: seed.categoryId ? [seed.categoryId] : [],
    search: seed.payee?.trim() ?? "",
  };
}

export function toggleListCategory(
  criteria: ListCriteria,
  categoryId: string,
): ListCriteria {
  const has = criteria.categoryIds.includes(categoryId);
  return {
    ...criteria,
    categoryIds: has
      ? criteria.categoryIds.filter((id) => id !== categoryId)
      : [...criteria.categoryIds, categoryId],
  };
}

export function toggleListPayee(
  criteria: ListCriteria,
  payeeKey: string,
): ListCriteria {
  const has = criteria.payeeKeys.includes(payeeKey);
  return {
    ...criteria,
    payeeKeys: has
      ? criteria.payeeKeys.filter((key) => key !== payeeKey)
      : [...criteria.payeeKeys, payeeKey],
  };
}

export function hasAmountFilter(criteria: ListCriteria): boolean {
  return criteria.amountMinPaise !== null || criteria.amountMaxPaise !== null;
}

/** How many filters differ from the default (search and sort count as one each). */
export function countActiveFilters(criteria: ListCriteria): number {
  return (
    (criteria.type !== "all" ? 1 : 0) +
    (criteria.categoryIds.length > 0 ? 1 : 0) +
    (criteria.payeeKeys.length > 0 ? 1 : 0) +
    (hasAmountFilter(criteria) ? 1 : 0) +
    (criteria.search.trim().length > 0 ? 1 : 0) +
    (criteria.sort !== "newest" ? 1 : 0)
  );
}

/**
 * True when the criteria need every page of the month (filters and a non-default sort run on the
 * loaded rows); a plain newest-first month can page on scroll.
 */
export function criteriaNeedAllRows(criteria: ListCriteria): boolean {
  return countActiveFilters(criteria) > 0;
}

/** The old kind a type filter alone stands for, for the empty-state copy; "all" for Expense / All. */
export function monthListKindOfType(type: ListTypeFilter): MonthListKind {
  if (type === "income" || type === "recurring" || type === "flexible") return type;
  return "all";
}

/** Whether a row belongs to the type. Expense is any debit; the rest follow {@link matchesMonthListKind}. */
export function matchesListType(
  row: Pick<TransactionRow, "type" | "category_scope">,
  type: ListTypeFilter,
): boolean {
  if (type === "all") return true;
  if (type === "expense") return row.type === "debit";
  return matchesMonthListKind(row, monthListKindOfType(type));
}

function formatRupees(paise: number): string {
  return formatInrCompact(paise / 100);
}

/** The Amount chip's value: "₹700 – ₹3,000", "₹500+" or "Up to ₹2,000". */
export function amountFilterLabel(criteria: ListCriteria): string {
  const { amountMinPaise: min, amountMaxPaise: max } = criteria;
  if (min !== null && max !== null) return `${formatRupees(min)} – ${formatRupees(max)}`;
  if (min !== null) return `${formatRupees(min)}+`;
  if (max !== null) return `Up to ${formatRupees(max)}`;
  return "Amount";
}

function rowCategoryKey(row: TransactionRow): string {
  const id = row.category_id?.trim();
  return id && id.length > 0 ? id : UNCATEGORIZED_CATEGORY_KEY;
}

function rowMatchesSearch(row: TransactionRow, needle: string): boolean {
  return [row.counterparty_name, row.merchant, row.note, row.category].some(
    (field) => field != null && field.toLowerCase().includes(needle),
  );
}

/** Narrows loaded rows by the criteria (order untouched; see {@link buildListSections} for sort). */
export function applyListCriteria(
  rows: TransactionRow[],
  criteria: ListCriteria,
): TransactionRow[] {
  const needle = criteria.search.trim().toLowerCase();
  const categories = new Set(criteria.categoryIds);
  const payees = new Set(criteria.payeeKeys);
  const { amountMinPaise: min, amountMaxPaise: max } = criteria;
  return rows.filter((row) => {
    if (!matchesListType(row, criteria.type)) return false;
    if (categories.size > 0 && !categories.has(rowCategoryKey(row))) {
      return false;
    }
    if (payees.size > 0 && !payees.has(transactionPayeeKey(row))) {
      return false;
    }
    if (min !== null || max !== null) {
      const paise = Math.abs(toPaise(row.amount));
      if (min !== null && paise < min) return false;
      if (max !== null && paise > max) return false;
    }
    return needle.length === 0 || rowMatchesSearch(row, needle);
  });
}

/** Id and name of a category the Category picker offers. */
export type CategoryOption = { id: string; name: string };

/**
 * The Category picker's options: Uncategorized, then the user's own spending categories (the
 * recurring ones belong to the Recurring type), then any selected id that is none of those (a
 * recurring category a link seeded) so it can still be unticked.
 */
export function buildCategoryOptions(
  spendCategories: readonly CategoryOption[],
  selectedIds: readonly string[] = [],
  nameOf: (id: string) => string | undefined = () => undefined,
): CategoryOption[] {
  const seen = new Set<string>([UNCATEGORIZED_CATEGORY_KEY]);
  const options: CategoryOption[] = [{ id: UNCATEGORIZED_CATEGORY_KEY, name: "Uncategorized" }];
  for (const category of spendCategories) {
    if (!seen.has(category.id)) {
      seen.add(category.id);
      options.push({ id: category.id, name: category.name });
    }
  }
  for (const id of selectedIds) {
    if (!seen.has(id)) {
      seen.add(id);
      options.push({ id, name: nameOf(id) ?? "Category" });
    }
  }
  return options;
}

export type PayeeOption = {
  key: string;
  name: string;
  count: number;
  /** Sum of the payee's absolute amounts, in paise. */
  totalPaise: number;
};

/** The payees present in the rows, most transactions first (then the larger total, then by name). */
export function buildPayeeOptions(rows: readonly TransactionRow[]): PayeeOption[] {
  const byKey = new Map<string, PayeeOption>();
  for (const row of rows) {
    const key = transactionPayeeKey(row);
    const existing = byKey.get(key);
    const paise = Math.abs(toPaise(row.amount));
    if (existing) {
      existing.count += 1;
      existing.totalPaise += paise;
    } else {
      const name = row.counterparty_name?.trim() || row.merchant?.trim() || "Unknown";
      byKey.set(key, { key, name, count: 1, totalPaise: paise });
    }
  }
  return [...byKey.values()].sort(
    (a, b) =>
      b.count - a.count ||
      b.totalPaise - a.totalPaise ||
      a.name.localeCompare(b.name),
  );
}

/** A multi-select's chip value: "Food", "Food +2" (spoken: "Food and 2 more"); "" when none. */
export function describeSelection(names: readonly string[]): { label: string; spoken: string } {
  if (names.length === 0) return { label: "", spoken: "" };
  const [first] = names;
  if (names.length === 1) return { label: first, spoken: first };
  const more = names.length - 1;
  return { label: `${first} +${more}`, spoken: `${first} and ${more} more` };
}

export type ListTotals = {
  count: number;
  spentPaise: number;
  receivedPaise: number;
};

export function computeListTotals(rows: readonly TransactionRow[]): ListTotals {
  let spentPaise = 0;
  let receivedPaise = 0;
  for (const row of rows) {
    const paise = Math.abs(toPaise(row.amount));
    if (row.type === "credit") receivedPaise += paise;
    else spentPaise += paise;
  }
  return { count: rows.length, spentPaise, receivedPaise };
}

/**
 * "24 transactions · ₹9,509 spent · ₹58,333 received": zero parts are left out and one row is
 * "1 transaction". `partial` (more pages still to load) marks the count with a "+".
 */
export function formatListTotalsLine(totals: ListTotals, partial = false): string {
  const plural = totals.count !== 1 || partial;
  const parts = [`${totals.count}${partial ? "+" : ""} transaction${plural ? "s" : ""}`];
  if (!partial) {
    if (totals.spentPaise > 0) parts.push(`${formatRupees(totals.spentPaise)} spent`);
    if (totals.receivedPaise > 0) parts.push(`${formatRupees(totals.receivedPaise)} received`);
  }
  return parts.join(" · ");
}

function rowTime(row: TransactionRow): number {
  return new Date(row.transaction_at).getTime();
}

/**
 * Day sections for the list. Newest and oldest keep a header per day (days and rows in that
 * order); highest amount is one flat section, since a global ranking cannot keep days together.
 */
export function buildListSections(
  rows: TransactionRow[],
  sort: ListSort,
): TransactionListSection[] {
  if (sort === "amount") {
    if (rows.length === 0) return [];
    return [
      {
        key: "amount-desc",
        title: "Highest amount first",
        data: [...rows].sort(
          (a, b) =>
            Math.abs(toPaise(b.amount)) - Math.abs(toPaise(a.amount)) ||
            rowTime(b) - rowTime(a),
        ),
      },
    ];
  }
  const sections = groupTransactionsByCalendarDay(rows);
  if (sort === "newest") return sections;
  return sections
    .map((section) => ({ ...section, data: [...section.data].reverse() }))
    .reverse();
}

/**
 * Entries still waiting to sync carry no category scope, so a recurring debit would look flexible.
 * Fills it in from the categories the app already has (only where it is missing).
 */
export function withCategoryScopes<T extends TransactionRow>(
  rows: readonly T[],
  scopeByCategoryId: ReadonlyMap<string, CategoryScope>,
): T[] {
  return rows.map((row) => {
    if (row.category_scope != null || !row.category_id) return row;
    const scope = scopeByCategoryId.get(row.category_id);
    return scope ? { ...row, category_scope: scope } : row;
  });
}
