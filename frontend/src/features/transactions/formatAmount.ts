import type { TransactionType } from "./types";

export function formatInrAmount(
  amount: string | number,
  options?: { signed?: boolean; type?: TransactionType },
): string {
  const n = typeof amount === "string" ? Number.parseFloat(amount) : amount;
  if (!Number.isFinite(n)) {
    return "₹0.00";
  }
  const formatted = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
  const base = `₹${formatted}`;
  if (options?.signed && options.type === "credit") {
    return `+${base}`;
  }
  if (options?.signed && options.type === "debit") {
    return `-${base}`;
  }
  return base;
}
