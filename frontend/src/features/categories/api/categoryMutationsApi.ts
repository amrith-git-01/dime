import { dimeApi } from "@/lib/api/dimeApi";

import type { CategoryRow } from "../types";

export type UpdateCategoryPayload = {
  name: string;
  icon_name?: string;
  color?: string;
};

export async function patchCategory(
  categoryId: string,
  payload: UpdateCategoryPayload,
): Promise<CategoryRow> {
  const { data } = await dimeApi.patch<CategoryRow>(
    `/api/v1/categories/${categoryId}`,
    payload,
  );
  return data;
}

export { deleteCategory, fetchCategoryDeleteImpact } from "./categoryDeleteApi";
export type { CategoryDeleteImpact } from "./categoryDeleteApi";
