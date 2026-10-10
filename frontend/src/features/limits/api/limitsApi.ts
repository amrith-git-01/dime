import { dimeApi } from "@/lib/api/dimeApi";

import type { LimitsResponse } from "../types";

export async function fetchLimits(): Promise<LimitsResponse> {
  const { data } = await dimeApi.get<LimitsResponse>("/api/v1/limits");
  return data;
}
