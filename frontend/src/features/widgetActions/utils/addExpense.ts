import { submitManualTransaction } from "@/features/transactions/api/submitTransactionApi";
import {
  DEFAULT_COUNTERPARTY_TYPE,
  type CounterpartyType,
} from "@/features/transactions/counterpartyTypes";
import { paiseToAmountString } from "@/utils/paise";

import { addedText } from "./captureText";
import { markCaptureAdded } from "./settleCapture";

/** The server takes a payee of 1 to 200 characters. */
const MAX_PAYEE_LENGTH = 200;

type AddExpenseInput = {
  userId: string;
  /** Positive. */
  amountPaise: number;
  /** Typed payee; empty falls back to the category's name. */
  payee: string;
  category: { id: string; name: string };
  /** The catalogue brand picked as the payee, if any. */
  brandId?: string | null;
  /** Of the payee; a person picked from "your payees" stays a person. */
  counterpartyType?: CounterpartyType;
  /** One per card session, so a retried Save cannot add the expense twice. */
  idempotencyKey: string;
  now?: Date;
};

/** The payee a Save will use. */
export function payeeFor(payee: string, categoryName: string): string {
  return (payee.trim() || categoryName).slice(0, MAX_PAYEE_LENGTH);
}

/**
 * Posts one everyday expense dated now and tells the widget (its numbers refresh in the background,
 * so the caller is released as soon as the server has the expense). Returns the confirmation text
 * ("Added ₹250 · Swiggy"). Throws an Error whose message is safe to show.
 */
export async function addExpense({
  userId,
  amountPaise,
  payee,
  category,
  brandId = null,
  counterpartyType = DEFAULT_COUNTERPARTY_TYPE,
  idempotencyKey,
  now = new Date(),
}: AddExpenseInput): Promise<string> {
  const name = payeeFor(payee, category.name);
  await submitManualTransaction(
    {
      amount: paiseToAmountString(amountPaise),
      type: "debit",
      counterparty_name: name,
      counterparty_type: counterpartyType,
      brand_id: brandId,
      category: category.name,
      category_id: category.id,
      note: null,
      transaction_at: now.toISOString(),
    },
    idempotencyKey,
  );
  const text = addedText(amountPaise / 100, name);
  markCaptureAdded({ userId, text });
  return text;
}
