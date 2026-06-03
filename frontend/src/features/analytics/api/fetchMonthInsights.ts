import { dimeApi } from "@/lib/api/dimeApi";

import type { MonthInsights } from "../types";

export async function fetchMonthInsights(input: {
  year: number;
  month: number;
  timezone: string;
}): Promise<MonthInsights> {
  const { data } = await dimeApi.get<MonthInsights>(
    "/api/v1/transactions/month-insights",
    {
      params: {
        year: input.year,
        month: input.month,
        timezone: input.timezone,
      },
    },
  );
  return data;
}
