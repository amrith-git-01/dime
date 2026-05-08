import { dimeApi } from "@/lib/api/dimeApi";

import type { CategoryRow } from "../types";

export async function fetchCategories(): Promise<CategoryRow[]> {
  const { data } = await dimeApi.get<CategoryRow[]>("/api/v1/categories");
  return data;
}
