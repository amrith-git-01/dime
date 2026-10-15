import type { CategorySpendRowData } from "@/components/categories/CategorySpendBentoRow";
import { categoryDefault } from "@/constants/colors";
import type { CategoryRow } from "@/features/categories/types";
import { UNCATEGORIZED_CATEGORY_KEY } from "@/features/transactions/constants/uncategorizedCategoryKey";
import type { MonthSummaryCategoryMeta } from "@/features/transactions/types";

export type BuildBudgetCategoryRowsInput = {
  /** Spend-scoped categories (the picker list). */
  categories: readonly CategoryRow[];
  /** Month debit totals keyed by category id (or the uncategorized key). */
  spendByCategory: Readonly<Record<string, number>>;
  /** Monthly caps by category id. */
  categoryCapById: ReadonlyMap<string, number>;
  /** Display meta of every spent category (any scope), keyed by lowercase id. */
  spentCategoryMetaById: ReadonlyMap<string, MonthSummaryCategoryMeta>;
};

/**
 * Rows of the Budgets category list: spend categories only. Recurring spend (rent, subscriptions, ...) lives in the
 * Recurring sections, so spend in a recurring-scoped category never becomes a row here.
 */
export function buildBudgetCategoryRows({
  categories,
  spendByCategory,
  categoryCapById,
  spentCategoryMetaById,
}: BuildBudgetCategoryRowsInput): CategorySpendRowData[] {
  const knownCategoryIds = new Set(categories.map((c) => c.id));
  const rows: CategorySpendRowData[] = categories.map((category) => ({
    id: category.id,
    name: category.name,
    icon_name: category.icon_name,
    color: category.color,
    spentMonth: spendByCategory[category.id] ?? 0,
    is_system: category.is_system,
    monthlyCap: categoryCapById.get(category.id) ?? null,
  }));

  const uncategorizedSpent = spendByCategory[UNCATEGORIZED_CATEGORY_KEY] ?? 0;
  if (uncategorizedSpent > 0) {
    rows.push({
      id: UNCATEGORIZED_CATEGORY_KEY,
      name: "Uncategorized",
      icon_name: "Package",
      color: categoryDefault,
      spentMonth: uncategorizedSpent,
      is_system: true,
      monthlyCap: null,
    });
  }

  for (const [categoryId, amount] of Object.entries(spendByCategory)) {
    if (categoryId === UNCATEGORIZED_CATEGORY_KEY || amount <= 0) continue;
    if (knownCategoryIds.has(categoryId)) continue;
    const spentMeta = spentCategoryMetaById.get(categoryId.toLowerCase());
    // Fixed spend is not a budget category.
    if (spentMeta?.scope && spentMeta.scope !== "spend") continue;
    if (spentMeta) {
      rows.push({
        id: spentMeta.id,
        name: spentMeta.name,
        icon_name: spentMeta.icon_name ?? "Package",
        color: spentMeta.color ?? categoryDefault,
        spentMonth: amount,
        is_system: true,
        monthlyCap: null,
        budgetEditable: false,
      });
    } else {
      rows.push({
        id: categoryId,
        name: "Unknown category",
        icon_name: "Package",
        color: categoryDefault,
        spentMonth: amount,
        is_system: true,
        monthlyCap: categoryCapById.get(categoryId) ?? null,
      });
    }
  }

  return rows.sort(
    (a, b) => b.spentMonth - a.spentMonth || a.name.localeCompare(b.name),
  );
}
