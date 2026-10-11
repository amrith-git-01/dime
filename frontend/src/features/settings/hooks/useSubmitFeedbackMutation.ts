import { useMutation } from "@tanstack/react-query";

import { submitFeedback } from "../api/feedbackApi";
import type { FeedbackSubmitPayload } from "../types";

export function useSubmitFeedbackMutation() {
  return useMutation({
    mutationFn: (payload: FeedbackSubmitPayload) => submitFeedback(payload),
  });
}
