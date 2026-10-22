import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useToast } from "@/features/toast/useToast";
import { isTourSampleId } from "@/features/tourPreview";
import { useSessionUserId } from "@/hooks/useSessionUserId";
import { parseFastApiError } from "@/lib/api/parseFastApiError";
import { getDeviceIanaTimezone } from "@/utils/deviceTimezone";

import { postPredictionFeedback } from "../api/forecastApi";
import { forecastQueryKeys } from "../queryKeys";
import type { ForecastResponse, PredictionFeedbackInput } from "../types";
import { removePredictionFromForecast } from "../utils/removePrediction";

/**
 * The user's answer to a prediction (confirm a habit, dismiss a card, "it's a one-off" ...).
 * The answered card leaves the cached forecast at once; a failure shows a toast, and the forecast
 * is refetched either way so the server has the last word (a card whose answer failed returns). A sample from the guided
 * tour is never sent anywhere.
 */
export function usePredictionFeedback() {
  const queryClient = useQueryClient();
  const { userId } = useSessionUserId();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: async (input: PredictionFeedbackInput) => {
      if (isTourSampleId(input.targetId)) return;
      await postPredictionFeedback({
        ...input,
        timezone: getDeviceIanaTimezone(),
      });
    },
    onMutate: async (input) => {
      const queryKey = forecastQueryKeys.user(userId);
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueriesData<ForecastResponse>({ queryKey }, (forecast) =>
        forecast ? removePredictionFromForecast(forecast, input) : forecast,
      );
    },
    // No snapshot to put back: with two answers in flight a restore would undo the other one too.
    // The refetch below brings back whatever the server still holds.
    onError: (error) => {
      showToast({ variant: "error", message: parseFastApiError(error) });
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: forecastQueryKeys.all }),
  });
}
