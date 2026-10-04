/** Extract payee/category identifiers from agent SQL result rows (port of `sql_entities.py`). */

export interface PayeeEntity {
  payeeId: string;
  displayName: string | null;
}

export interface CategoryEntity {
  categoryId: string;
  displayName: string | null;
}

export interface SqlEntities {
  payees: PayeeEntity[];
  categories: CategoryEntity[];
}

export interface SqlResultLike {
  rows?: unknown;
  [key: string]: unknown;
}

type Row = Record<string, unknown>;

function nonEmptyStr(value: unknown): string | null {
  if (typeof value === 'string') {
    const stripped = value.trim();
    if (stripped) return stripped;
  }
  return null;
}

function rowPayee(row: Row): PayeeEntity | null {
  const payeeId = nonEmptyStr(row['counterparty_normalized']) ?? nonEmptyStr(row['payee_id']) ?? nonEmptyStr(row['payee_key']);
  if (payeeId === null) return null;
  const displayName = nonEmptyStr(row['counterparty_name']) ?? nonEmptyStr(row['payee_display_name']);
  return { payeeId, displayName };
}

function rowCategory(row: Row): CategoryEntity | null {
  let categoryId = nonEmptyStr(row['category_id']);
  if (categoryId === null) {
    categoryId = nonEmptyStr(row['id']);
    // A bare `id` only counts as a category id when a category/name column accompanies it.
    if (categoryId !== null && nonEmptyStr(row['category_name']) === null && nonEmptyStr(row['name']) === null) categoryId = null;
  }
  if (categoryId === null) return null;
  const displayName =
    nonEmptyStr(row['category_name']) ?? nonEmptyStr(row['category_display_name']) ?? nonEmptyStr(row['name']);
  return { categoryId, displayName };
}

/** Distinct payee/category ids present in the result rows (first row wins, a later name fills a missing one). */
export function extractSqlEntities(lastResult: SqlResultLike | null | undefined): SqlEntities {
  const rows = lastResult?.rows;
  if (!Array.isArray(rows)) return { payees: [], categories: [] };

  const payees = new Map<string, PayeeEntity>();
  const categories = new Map<string, CategoryEntity>();
  for (const raw of rows) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) continue;
    const row = raw as Row;
    const payee = rowPayee(row);
    if (payee) {
      const existing = payees.get(payee.payeeId);
      if (!existing || (existing.displayName === null && payee.displayName)) payees.set(payee.payeeId, payee);
    }
    const category = rowCategory(row);
    if (category) {
      const existing = categories.get(category.categoryId);
      if (!existing || (existing.displayName === null && category.displayName)) categories.set(category.categoryId, category);
    }
  }
  return { payees: [...payees.values()], categories: [...categories.values()] };
}
