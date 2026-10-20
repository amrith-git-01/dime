import type { TransactionRow } from "../../types";
import { transactionRowToFormState } from "../transactionRowToFormState";

function row(partial: Partial<TransactionRow>): TransactionRow {
  return {
    id: "tx-1",
    user_id: "user-1",
    amount: "500.00",
    type: "debit",
    counterparty_name: "Swiggy",
    counterparty_type: "merchant",
    counterparty_normalized: "swiggy",
    merchant: "Swiggy",
    category: "Food",
    category_id: "cat-food",
    category_icon_name: null,
    category_color: null,
    note: null,
    detected_via: "sms",
    transaction_at: "2026-08-02T12:00:00.000Z",
    created_at: "2026-08-02T12:01:00.000Z",
    updated_at: "2026-08-02T12:01:00.000Z",
    deleted_at: null,
    receipt_url: null,
    voice_url: null,
    ...partial,
  };
}

describe("transactionRowToFormState", () => {
  it("maps a debit row", () => {
    const debit = transactionRowToFormState(row({}));
    expect(debit.amountText).toBe("500");
    expect(debit.txType).toBe("debit");
    expect(debit.counterpartyName).toBe("Swiggy");
    expect(debit.category).toBe("Food");
    expect(debit.categoryId).toBe("cat-food");
    expect(debit.note).toBe("");
    expect(debit.transactionAt.toISOString()).toBe("2026-08-02T12:00:00.000Z");
  });

  it("carries the catalogue brand, or null when the row has none", () => {
    expect(transactionRowToFormState(row({ brand_id: "wd:swiggy" })).brandId).toBe("wd:swiggy");
    expect(transactionRowToFormState(row({})).brandId).toBeNull();
  });

  it("maps a credit row with fallbacks", () => {
    const credit = transactionRowToFormState(
      row({
        amount: "250.50",
        type: "credit",
        note: "salary",
        counterparty_name: null,
        merchant: "Acme",
        category: null,
        category_id: null,
      }),
    );
    expect(credit.amountText).toBe("250.50");
    expect(credit.txType).toBe("credit");
    expect(credit.counterpartyName).toBe("Acme");
    expect(credit.note).toBe("salary");
    expect(credit.category).toBe("");
    expect(credit.categoryId).toBeNull();
  });
});
