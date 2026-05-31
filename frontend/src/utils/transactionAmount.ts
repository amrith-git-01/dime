/** Normalize API/realtime amount fields to decimal strings (no currency symbol). */
export function normalizeTransactionAmount(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toFixed(2);
  }
  return "0.00";
}
