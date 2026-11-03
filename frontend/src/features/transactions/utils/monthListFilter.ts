import { toPaise } from "@/utils/paise";

import { UNCATEGORIZED_CATEGORY_KEY } from "../constants/uncategorizedCategoryKey";
import type { CategoryScope, TransactionRow } from "../types";

import {
  groupTransactionsByCalendarDay,
  type TransactionListSection,
} from "./buildTransactionFlashListData";

/** What the month list narrows to: everything, or one slice of the month's money. */
export type MonthListKind = "all" | "recurring" | "flexible" | "income";

export const MONTH_LIST_KINDS: readonly MonthListKind[] = [
  "all",
  "recurring",
  "flexible",
  "income",
];

export const MONTH_LIST_KIND_LABELS: Record<MonthListKind, string> = {
  all: "All",
  recurring: "Recurring",
  flexible: "Flexible",
  income: "Income",
};

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
// The general list's filters: type, kind, categories, text search and sort.
// ---------------------------------------------------------------------------

export type ListTypeFilter = "all" | "debit" | "credit";
export type ListKindFilter = "all" | "recurring" | "flexible";
export type ListSort = "newest" | "oldest" | "amount";

export type ListCriteria = {
  type: ListTypeFilter;
  /** Recurring / flexible only ever match debits. */
  kind: ListKindFilter;
  /** Category ids (or {@link UNCATEGORIZED_CATEGORY_KEY}); empty = every category. */
  categoryIds: string[];
  search: string;
  sort: ListSort;
};

export const DEFAULT_LIST_CRITERIA: ListCriteria = {
  type: "all",
  kind: "all",
  categoryIds: [],
  search: "",
  sort: "newest",
};

/** The quick chips are shortcuts for a type + kind pair. */
const CHIP_CRITERIA: Record<
  MonthListKind,
  Pick<ListCriteria, "type" | "kind">
> = {
  all: { type: "all", kind: "all" },
  recurring: { type: "debit", kind: "recurring" },
  flexible: { type: "debit", kind: "flexible" },
  income: { type: "credit", kind: "all" },
};

export function criteriaFromKind(kind: MonthListKind | undefined): ListCriteria {
  return { ...DEFAULT_LIST_CRITERIA, ...CHIP_CRITERIA[kind ?? "all"] };
}

/** The starting filters for a list opened from elsewhere (a split bar, a category, a payee). */
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

/** Selects a chip: replaces type and kind, keeps categories, search and sort. */
export function applyKindChip(
  criteria: ListCriteria,
  kind: MonthListKind,
): ListCriteria {
  return { ...criteria, ...CHIP_CRITERIA[kind] };
}

/** The chip whose type + kind the criteria match exactly, or null (e.g. type Spent with any kind). */
export function activeKindChip(criteria: ListCriteria): MonthListKind | null {
  return (
    MONTH_LIST_KINDS.find(
      (kind) =>
        CHIP_CRITERIA[kind].type === criteria.type &&
        CHIP_CRITERIA[kind].kind === criteria.kind,
    ) ?? null
  );
}

/** Received money is never recurring or flexible spend, so Received clears the kind. */
export function setListType(
  criteria: ListCriteria,
  type: ListTypeFilter,
): ListCriteria {
  return {
    ...criteria,
    type,
    kind: type === "credit" ? "all" : criteria.kind,
  };
}

/** A kind is a kind of spend, so picking one moves Received back to All. */
export function setListKind(
  criteria: ListCriteria,
  kind: ListKindFilter,
): ListCriteria {
  return {
    ...criteria,
    kind,
    type: kind !== "all" && criteria.type === "credit" ? "all" : criteria.type,
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

/** How many filters differ from the default (the badge on the Filters button). */
export function countActiveFilters(criteria: ListCriteria): number {
  return (
    (criteria.type !== "all" ? 1 : 0) +
    (criteria.kind !== "all" ? 1 : 0) +
    (criteria.categoryIds.length > 0 ? 1 : 0) +
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
  return rows.filter((row) => {
    if (criteria.type !== "all" && row.type !== criteria.type) return false;
    if (criteria.kind !== "all" && !matchesMonthListKind(row, criteria.kind)) {
      return false;
    }
    if (categories.size > 0 && !categories.has(rowCategoryKey(row))) {
      return false;
    }
    return needle.length === 0 || rowMatchesSearch(row, needle);
  });
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
