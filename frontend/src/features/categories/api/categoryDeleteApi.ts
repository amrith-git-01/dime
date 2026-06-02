import { dimeApi } from "@/lib/api/dimeApi";

export type CategoryDeleteImpact = {
  transaction_count: number;
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
