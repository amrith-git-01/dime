import type { CategoryRow } from "@/features/categories/types";

export function sortCategories(rows: CategoryRow[]): CategoryRow[] {
  return [...rows].sort((a, b) => {
    if (a.is_system !== b.is_system) {
      return a.is_system ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}
