import { dimeApi } from "@/lib/api/dimeApi";

import type {
  ForecastAccuracyResponse,
  ForecastResponse,
  PredictionFeedbackInput,
} from "../types";

export async function fetchForecast(input: {
  year: number;
  month: number;
  timezone: string;
}): Promise<ForecastResponse> {
  const { data } = await dimeApi.get<ForecastResponse>("/api/v1/forecast", {
    params: {
      year: input.year,
      month: input.month,
      timezone: input.timezone,
    },
  });
  return data;
}

/** The last three scored months, newest first. */
export async function fetchForecastAccuracy(): Promise<ForecastAccuracyResponse> {
  const { data } = await dimeApi.get<ForecastAccuracyResponse>(
    "/api/v1/forecast/accuracy",
  );
  return data;
}

/** The user's answer to a prediction. 204: the caller refetches the forecast. */
export async function postPredictionFeedback(
  input: PredictionFeedbackInput & { timezone?: string },
): Promise<void> {
  await dimeApi.post("/api/v1/predictions/feedback", input);
}
