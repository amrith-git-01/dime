import type { ForecastResponse, PredictionFeedbackInput } from "../types";

/**
 * The forecast with the card the user just answered taken off, so the list answers at once
 * while the request runs (the server's next forecast is the authority). A "yes, usual" on a
 * likely spend changes nothing on screen, so it returns the forecast as it was.
 */
export function removePredictionFromForecast(
  forecast: ForecastResponse,
  input: PredictionFeedbackInput,
): ForecastResponse {
  const { targetKind, targetId, verdict } = input;
  switch (targetKind) {
    case "payee":
      return verdict === "dismiss"
        ? {
            ...forecast,
            upcoming: forecast.upcoming.filter(
              (item) => !(item.kind === "likely" && item.payeeKey === targetId),
            ),
          }
        : forecast;
    case "subscription_candidate":
      return {
        ...forecast,
        watch: forecast.watch.filter(
          (item) =>
            !(item.kind === "subscription_candidate" && item.payeeKey === targetId),
        ),
      };
    case "unusual_txn":
      return {
        ...forecast,
        watch: forecast.watch.filter(
          (item) => !(item.kind === "unusual" && item.transactionId === targetId),
        ),
      };
    case "category_watch":
      return {
        ...forecast,
        watch: forecast.watch.filter(
          (item) => !(item.kind === "category_hot" && item.categoryId === targetId),
        ),
      };
    default:
      return forecast;
  }
}
