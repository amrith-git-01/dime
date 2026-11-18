import { dimeApi } from "@/lib/api/dimeApi";

export type CategoryDeleteImpact = {
  transaction_count: number;
  /** The category has a monthly budget, and deleting the category removes it. Absent on older servers. */
  budget_removed?: boolean;
  /** That budget's monthly amount (decimal string); null when there is none. */
  budget_amount?: string | null;
};

export async function fetchCategoryDeleteImpact(
  categoryId: string,
): Promise<CategoryDeleteImpact> {
  const { data } = await dimeApi.get<CategoryDeleteImpact>(
    `/api/v1/categories/${categoryId}/delete-impact`,
  );
  return data;
}

export async function deleteCategory(
  categoryId: string,
  reassignToCategoryId?: string,
): Promise<void> {
  await dimeApi.delete(`/api/v1/categories/${categoryId}`, {
    params:
      reassignToCategoryId != null
        ? { reassign_to_category_id: reassignToCategoryId }
        : undefined,
  });
}
