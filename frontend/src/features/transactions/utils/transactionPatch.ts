import { toPaise } from "@/utils/paise";

import type { CreateTransactionBody, UpdateTransactionBody } from "../api/transactionsApi";
import type { TransactionRow } from "../types";
import { kindOf } from "./transactionKind";

function sameInstant(a: string, b: string): boolean {
  const left = Date.parse(a);
  const right = Date.parse(b);
  return Number.isNaN(left) || Number.isNaN(right) ? a === b : left === right;
}

function currentName(row: TransactionRow): string {
  const name = (row.counterparty_name ?? "").trim();
  return name.length > 0 ? name : row.merchant.trim();
}

/**
 * The fields of an entry that differ from the saved row, plus the `updated_at` it was read at
 * (`expected_updated_at`). PATCH changes only what is sent, so an untouched field (a recurring-locked
 * category, a brand) is never rewritten, and another device's edit to a field this one did not touch survives.
 */
export function buildTransactionPatch(
  original: TransactionRow,
  next: CreateTransactionBody,
): UpdateTransactionBody {
  const patch: UpdateTransactionBody = { expected_updated_at: original.updated_at };
  if (toPaise(next.amount) !== toPaise(original.amount)) {
    patch.amount = next.amount;
  }
  if (next.type !== original.type) {
    patch.type = next.type;
  }
  if (next.counterparty_name.trim() !== currentName(original)) {
    patch.counterparty_name = next.counterparty_name;
  }
  if (next.counterparty_type !== original.counterparty_type) {
    patch.counterparty_type = next.counterparty_type;
  }
  if (next.kind !== undefined && next.kind !== kindOf(original)) {
    patch.kind = next.kind;
  }
  if (next.category_id !== undefined && (next.category_id ?? null) !== original.category_id) {
    patch.category_id = next.category_id;
    patch.category = next.category;
  } else if ((next.category ?? null) !== (original.category ?? null) && next.category_id === undefined) {
    patch.category = next.category;
  }
  if (next.brand_id !== undefined && (next.brand_id ?? null) !== (original.brand_id ?? null)) {
    patch.brand_id = next.brand_id;
  }
  if ((next.note ?? null) !== ((original.note ?? "").trim() || null)) {
    patch.note = next.note;
  }
  if (!sameInstant(next.transaction_at, original.transaction_at)) {
    patch.transaction_at = next.transaction_at;
  }
  return patch;
}

/** Whether a patch carries any change besides its `expected_updated_at` guard. */
export function patchHasChanges(patch: UpdateTransactionBody): boolean {
  return Object.keys(patch).some((key) => key !== "expected_updated_at");
}

/** Whether the row already holds every field the patch sets (a replayed edit whose first attempt did land). */
export function patchAlreadyApplied(row: TransactionRow, patch: UpdateTransactionBody): boolean {
  if (!patchHasChanges(patch)) {
    return row.needs_review !== true;
  }
  if (patch.amount !== undefined && toPaise(patch.amount) !== toPaise(row.amount)) {
    return false;
  }
  if (patch.type !== undefined && patch.type !== row.type) {
    return false;
  }
  if (patch.counterparty_name !== undefined && patch.counterparty_name.trim() !== currentName(row)) {
    return false;
  }
  if (patch.counterparty_type !== undefined && patch.counterparty_type !== row.counterparty_type) {
    return false;
  }
  if (patch.kind !== undefined && patch.kind !== kindOf(row)) {
    return false;
  }
  if (patch.category_id !== undefined && (patch.category_id ?? null) !== row.category_id) {
    return false;
  }
  if (patch.brand_id !== undefined && (patch.brand_id ?? null) !== (row.brand_id ?? null)) {
    return false;
  }
  if (patch.note !== undefined && (patch.note ?? null) !== ((row.note ?? "").trim() || null)) {
    return false;
  }
  if (patch.transaction_at !== undefined && !sameInstant(patch.transaction_at, row.transaction_at)) {
    return false;
  }
  return true;
}

/** The saved row with a patch laid over it: what an edit made offline looks like until it syncs. */
export function applyPatchToRow(row: TransactionRow, patch: UpdateTransactionBody): TransactionRow {
  const next: TransactionRow = { ...row };
  if (patch.amount !== undefined) {
    next.amount = patch.amount;
  }
  if (patch.type !== undefined) {
    next.type = patch.type;
  }
  if (patch.counterparty_name !== undefined) {
    next.counterparty_name = patch.counterparty_name.trim();
    next.merchant = patch.counterparty_name.trim();
  }
  if (patch.counterparty_type !== undefined) {
    next.counterparty_type = patch.counterparty_type;
  }
  if (patch.kind !== undefined) {
    next.kind = patch.kind;
  }
  if (patch.category_id !== undefined) {
    next.category_id = patch.category_id ?? null;
  }
  if (patch.category !== undefined) {
    next.category = patch.category;
  }
  if (patch.brand_id !== undefined) {
    next.brand_id = patch.brand_id ?? null;
  }
  if (patch.note !== undefined) {
    next.note = patch.note;
  }
  if (patch.transaction_at !== undefined) {
    next.transaction_at = patch.transaction_at;
  }
  next.needs_review = false;
  return next;
}
