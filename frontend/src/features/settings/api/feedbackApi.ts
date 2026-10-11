import { dimeApi } from "@/lib/api/dimeApi";

import type { FeedbackSubmitPayload } from "../types";

export async function submitFeedback(
  payload: FeedbackSubmitPayload,
): Promise<{ id: string }> {
  const { data } = await dimeApi.post<{ id: string }>("/api/v1/feedback", {
    type: payload.type,
    message: payload.message,
  });
  return data;
}
