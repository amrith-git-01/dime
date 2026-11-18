import type { CreateTransactionBody } from "../../api/transactionsApi";
import type { TransactionRow } from "../../types";
import { defaultKindFor, isTransferRow, kindOf } from "../transactionKind";
import {
  applyPatchToRow,
  buildTransactionPatch,
  patchAlreadyApplied,
  patchHasChanges,
} from "../transactionPatch";

const SEEN_AT = "2026-10-15T08:00:00.000Z";

function row(over: Partial<TransactionRow> = {}): TransactionRow {
  return {
    id: "t1",
    user_id: "u1",
    amount: "250.00",
    type: "debit",
    kind: "spend",
    counterparty_name: "Swiggy",
    counterparty_type: "merchant",
    counterparty_normalized: "swiggy",
    merchant: "Swiggy",
    category: "Food",
    category_id: "cat-food",
    category_icon_name: null,
    category_color: null,
    brand_id: "brand-swiggy",
    note: "dinner",
    detected_via: "manual",
    transaction_at: "2026-10-14T13:30:00.000Z",
    created_at: SEEN_AT,
    updated_at: SEEN_AT,
    deleted_at: null,
    receipt_url: null,
    voice_url: null,
    ...over,
  };
}

/** What the form builds when nothing was touched. */
function untouched(over: Partial<CreateTransactionBody> = {}): CreateTransactionBody {
  return {
    amount: "250.00",
    type: "debit",
    kind: "spend",
    counterparty_name: "Swiggy",
    counterparty_type: "merchant",
    brand_id: "brand-swiggy",
    category: "Food",
    category_id: "cat-food",
    note: "dinner",
    transaction_at: "2026-10-14T13:30:00.000Z",
    ...over,
  };
}

describe("buildTransactionPatch", () => {
  it("an untouched entry is just the guard: no field is sent", () => {
    const patch = buildTransactionPatch(row(), untouched());
    expect(patch).toEqual({ expected_updated_at: SEEN_AT });
    expect(patchHasChanges(patch)).toBe(false);
  });

  it("sends only what changed, with the updated_at the edit started from", () => {
    const patch = buildTransactionPatch(row(), untouched({ note: "lunch" }));
    expect(patch).toEqual({ expected_updated_at: SEEN_AT, note: "lunch" });
    expect(patchHasChanges(patch)).toBe(true);
  });

  it("reads equal amounts as equal however they are spelled", () => {
    expect(buildTransactionPatch(row({ amount: "250" }), untouched({ amount: "250.00" }))).toEqual({
      expected_updated_at: SEEN_AT,
    });
    expect(buildTransactionPatch(row(), untouched({ amount: "250.50" })).amount).toBe("250.50");
  });

  it("a note cleared sends null; a time moved sends the new instant", () => {
    expect(buildTransactionPatch(row(), untouched({ note: null })).note).toBeNull();
    expect(buildTransactionPatch(row(), untouched({ transaction_at: "2026-10-14T14:00:00.000Z" })).transaction_at).toBe(
      "2026-10-14T14:00:00.000Z",
    );
    // The same instant written with an offset is not a change.
    expect(
      buildTransactionPatch(row(), untouched({ transaction_at: "2026-10-14T19:00:00+05:30" })).transaction_at,
    ).toBeUndefined();
  });

  it("a category change sends both the id and the name; clearing it sends nulls", () => {
    expect(buildTransactionPatch(row(), untouched({ category: "Travel", category_id: "cat-travel" }))).toMatchObject({
      category: "Travel",
      category_id: "cat-travel",
    });
    expect(buildTransactionPatch(row(), untouched({ category: null, category_id: null }))).toMatchObject({
      category: null,
      category_id: null,
    });
  });

  it("a recurring-locked category that was not touched is never rewritten", () => {
    const posted = row({ category: "Rent", category_id: "cat-rent", recurring_item_id: "rec-1" });
    const patch = buildTransactionPatch(posted, untouched({ category: "Rent", category_id: "cat-rent", note: "march" }));
    expect(patch).toEqual({ expected_updated_at: SEEN_AT, note: "march" });
  });

  it("typing a new payee clears the brand so the server re-matches the name", () => {
    const patch = buildTransactionPatch(row(), untouched({ counterparty_name: "Zomato", brand_id: null }));
    expect(patch).toMatchObject({ counterparty_name: "Zomato", brand_id: null });
  });

  it("changing the kind (Spend to Transfer) sends it; the same kind does not", () => {
    expect(buildTransactionPatch(row(), untouched({ kind: "transfer" })).kind).toBe("transfer");
    expect(buildTransactionPatch(row(), untouched({ kind: "spend" })).kind).toBeUndefined();
    // A refund the user did not retype stays a payback: the form carries "payback" and nothing is sent.
    expect(buildTransactionPatch(row({ type: "credit", kind: "payback" }), untouched({ type: "credit", kind: "payback" })).kind).toBeUndefined();
  });

  it("a row from before the money model reads its kind from the direction", () => {
    const legacy = row({ kind: undefined });
    expect(buildTransactionPatch(legacy, untouched({ kind: "spend" })).kind).toBeUndefined();
  });
});

describe("patchAlreadyApplied", () => {
  it("is true when the row already holds every field the patch sets (a replay whose first attempt landed)", () => {
    const saved = row({ note: "lunch", amount: "260.00" });
    expect(patchAlreadyApplied(saved, { expected_updated_at: SEEN_AT, note: "lunch", amount: "260.00" })).toBe(true);
    expect(patchAlreadyApplied(saved, { expected_updated_at: SEEN_AT, note: "lunch", amount: "270.00" })).toBe(false);
    expect(patchAlreadyApplied(saved, { expected_updated_at: SEEN_AT, note: "different" })).toBe(false);
    expect(patchAlreadyApplied(saved, { expected_updated_at: SEEN_AT, kind: "transfer" })).toBe(false);
  });

  it("an empty edit (mark as checked) is applied once the row no longer needs review", () => {
    expect(patchAlreadyApplied(row({ needs_review: true }), { expected_updated_at: SEEN_AT })).toBe(false);
    expect(patchAlreadyApplied(row({ needs_review: false }), { expected_updated_at: SEEN_AT })).toBe(true);
  });
});

describe("applyPatchToRow", () => {
  it("lays the changed fields over the row (an edit saved offline) and settles needs_review", () => {
    const next = applyPatchToRow(row({ needs_review: true }), {
      expected_updated_at: SEEN_AT,
      note: "offline",
      amount: "300.00",
      counterparty_name: " Zomato ",
    });
    expect(next).toMatchObject({ note: "offline", amount: "300.00", counterparty_name: "Zomato", merchant: "Zomato", needs_review: false });
    // `updated_at` stays what the server last said: it is what the replay is guarded by.
    expect(next.updated_at).toBe(SEEN_AT);
  });
});

describe("transaction kind", () => {
  it("is the stored kind, else the direction (and an own-account transfer)", () => {
    expect(kindOf(row())).toBe("spend");
    expect(kindOf(row({ kind: undefined, type: "credit" }))).toBe("income");
    expect(kindOf(row({ kind: undefined, counterparty_type: "self_transfer" }))).toBe("transfer");
    expect(defaultKindFor("debit")).toBe("spend");
    expect(defaultKindFor("credit", "person")).toBe("income");
    expect(defaultKindFor("credit", "self_transfer")).toBe("transfer");
  });

  it("only a transfer is a transfer row", () => {
    expect(isTransferRow(row({ kind: "transfer" }))).toBe(true);
    expect(isTransferRow(row({ type: "credit", kind: "payback" }))).toBe(false);
    expect(isTransferRow(row())).toBe(false);
  });
});
