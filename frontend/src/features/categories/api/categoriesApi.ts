import { dimeApi } from "@/lib/api/dimeApi";

import type {
  CategoryRow,
  CategoryScope,
  CreateCategoryPayload,
} from "../types";

/** `spend` (the default) is every category for ordinary transactions; the recurring scopes feed the recurring editor. */
export async function fetchCategories(
  scope: CategoryScope = "spend",
): Promise<CategoryRow[]> {
  const { data } = await dimeApi.get<CategoryRow[]>("/api/v1/categories", {
    params: { scope },
  });
  return data;
}

export async function createCategory(
  payload: CreateCategoryPayload,
): Promise<CategoryRow> {
  const { data } = await dimeApi.post<CategoryRow>(
    "/api/v1/categories",
    payload,
  );
  return data;
}
