import { dimeApi } from "@/lib/api/dimeApi";

import type { CategoryRow, CreateCategoryPayload } from "../types";

export async function fetchCategories(): Promise<CategoryRow[]> {
  const { data } = await dimeApi.get<CategoryRow[]>("/api/v1/categories");
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
