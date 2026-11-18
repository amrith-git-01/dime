import { parseAmountInputToRupees } from "@/utils/paise";

/**
 * Parse optional budget text strictly (the same rule as every money field: at most two decimals, no letters,
 * within the API's limit); returns a positive amount or null if empty or invalid. "12abc" is not 12.
 */
export function parseBudgetAmount(text: string): number | null {
  return parseAmountInputToRupees(text);
}
