import { dimeApi } from "@/lib/api/dimeApi";

export type CategoryBudgetItem = {
  category_id: string;
  monthly_amount: string;
};

export async function fetchCategoryBudgets(): Promise<CategoryBudgetItem[]> {
  const { data } = await dimeApi.get<{ items: CategoryBudgetItem[] }>(
    "/api/v1/budget/categories",
  );
  return data.items ?? [];
}

export async function upsertCategoryBudget(
  categoryId: string,
  monthlyAmount: number,
): Promise<CategoryBudgetItem> {
  const { data } = await dimeApi.put<CategoryBudgetItem>(
    `/api/v1/budget/categories/${categoryId}`,
    { monthly_amount: monthlyAmount.toFixed(2) },
  );
  return data;
}

export async function deleteCategoryBudget(categoryId: string): Promise<void> {
  await dimeApi.delete(`/api/v1/budget/categories/${categoryId}`);
}
