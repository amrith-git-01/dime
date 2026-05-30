import type { TransactionType } from "./types";

/** Narrow gap between ₹ and digits (tighter than a normal space). */
const INR_AMOUNT_SEPARATOR = "\u202F";

function formatInrWithSymbol(formatted: string): string {
  return `₹${INR_AMOUNT_SEPARATOR}${formatted}`;
}

export function formatInrAmount(
  amount: string | number,
  options?: { signed?: boolean; type?: TransactionType },
): string {
  const n = typeof amount === "string" ? Number.parseFloat(amount) : amount;
  if (!Number.isFinite(n)) {
    return formatInrWithSymbol("0.00");
  }
  const formatted = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
  const base = formatInrWithSymbol(formatted);
  if (options?.signed && options.type === "credit") {
    return `+${base}`;
  }
  if (options?.signed && options.type === "debit") {
    return `-${base}`;
  }
  return base;
}

/** Whole rupees for hero / chips (no paise). */
export function formatInrCompact(amount: string | number): string {
  const n = typeof amount === "string" ? Number.parseFloat(amount) : amount;
  if (!Number.isFinite(n)) {
    return formatInrWithSymbol("0");
  }
  const formatted = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
  return formatInrWithSymbol(formatted);
}

/** Debit-style display: leading minus, whole rupees (for outflows on light surfaces). */
export function formatInrDebitCompact(amount: string | number): string {
  const n = typeof amount === "string" ? Number.parseFloat(amount) : amount;
  if (!Number.isFinite(n) || n === 0) {
    return formatInrWithSymbol("0");
  }
  const formatted = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.abs(n));
  return `-${formatInrWithSymbol(formatted)}`;
}
