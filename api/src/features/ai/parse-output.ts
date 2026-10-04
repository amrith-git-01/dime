import * as z from 'zod';

import { decimalInput, quantizeMoney } from '../../core/decimal';
import { parseDatetime } from '../transactions/schemas';
import type { Instant } from '../transactions/schemas';
import type { ParseMode } from './prompts';

export const COUNTERPARTY_TYPES = ['merchant', 'person', 'self_transfer', 'unknown'] as const;
export type ParsedCounterpartyType = (typeof COUNTERPARTY_TYPES)[number];
const COUNTERPARTY_SET: ReadonlySet<string> = new Set(COUNTERPARTY_TYPES);

export interface CategoryOption {
  id: string;
  name: string;
}

export interface ParseContext {
  mode: ParseMode;
  model: string;
  allowedCategories: readonly string[];
  categoryOptions: readonly CategoryOption[];
}

/** What the model understood from a receipt / voice note / SMS, after validation and normalization. */
export interface ParsedExpense {
  counterpartyName: string;
  counterpartyType: ParsedCounterpartyType;
  /** Decimal string with two places. */
  amount: string;
  type: 'debit' | 'credit';
  /** `null` when the model gave no usable date (the caller picks the fallback instant). */
  date: Instant | null;
  category: string;
  categoryId: string | null;
  note: string | null;
  confidence: number;
  rawModel: string;
}

/** The model's answer could not be turned into a valid expense (invalid JSON or a failed validation). */
export class ModelOutputError extends Error {
  override name = 'ModelOutputError';
}

/** Port of `ParseExpenseResult` (pydantic): the same bounds, checked on the normalized data. */
const expenseSchema = z.object({
  counterparty_name: z.string().min(1).max(120),
  counterparty_type: z.enum(COUNTERPARTY_TYPES),
  amount: decimalInput({ positive: true }).transform((canonical, ctx): string => {
    const cents = quantizeMoney(canonical);
    if (cents === '0.00') {
      ctx.addIssue({ code: 'custom', message: 'Input should be greater than 0' });
      return z.NEVER;
    }
    return cents;
  }),
  type: z.enum(['debit', 'credit']),
  category: z.string().min(1).max(64),
  category_id: z.string().nullable(),
  note: z.string().max(2000).nullable(),
  confidence: z.number().min(0).max(1),
  raw_model: z.string().min(1),
});

/** Models sometimes wrap JSON in a markdown fence even in JSON mode. */
export function stripJsonFences(raw: string): string {
  let text = raw.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^`+/, '');
    if (text.toLowerCase().startsWith('json')) text = text.slice(4);
    if (text.endsWith('```')) text = text.slice(0, -3);
  }
  return text.trim();
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const nonBlankString = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

/** `_normalize_category`: the allowed name it matches (case-insensitive), else "Other", else the first allowed. */
export function normalizeCategory(raw: unknown, allowed: readonly string[]): string {
  const categories = allowed.map((c) => c.trim()).filter(Boolean);
  if (categories.length === 0) return nonBlankString(raw) ? raw.trim() : 'Other';
  const lookup = new Map<string, string>();
  for (const c of categories) lookup.set(c.toLowerCase(), c);
  if (typeof raw === 'string') {
    const hit = lookup.get(raw.trim().toLowerCase());
    if (hit) return hit;
  }
  return lookup.get('other') ?? (categories[0] as string);
}

function categoryIdByName(name: string, options: readonly CategoryOption[]): string | null {
  const wanted = name.trim().toLowerCase();
  const hit = options.find((o) => o.name.trim().toLowerCase() === wanted);
  return hit && hit.id ? hit.id : null;
}

function categoryNameById(raw: string, options: readonly CategoryOption[]): string | null {
  const wanted = raw.trim().toLowerCase();
  const hit = options.find((o) => o.id.trim().toLowerCase() === wanted);
  return hit ? hit.name.trim() : null;
}

const DMY = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/;
const YMD_SLASH = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/;

/** `_parse_date`: ISO first, then DD/MM/YYYY, DD-MM-YYYY and YYYY/MM/DD (UTC midnight). Unusable input is null. */
export function parseModelDate(raw: unknown): Instant | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value) return null;
  const iso = parseDatetime(value);
  if (iso) return iso;
  let year: number, month: number, day: number;
  const dmy = DMY.exec(value);
  const ymd = YMD_SLASH.exec(value);
  if (dmy) [day, month, year] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3])] as [number, number, number];
  else if (ymd) [year, month, day] = [Number(ymd[1]), Number(ymd[2]), Number(ymd[3])] as [number, number, number];
  else return null;
  const ms = Date.UTC(year, month - 1, day);
  const check = new Date(ms);
  if (month < 1 || month > 12 || check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return { ms, iso: check.toISOString() };
}

const SOURCE_LABEL: Record<ParseMode, string> = { receipt: 'receipt', sms: 'SMS', voice: 'voice input' };

/** `Auto-parsed from receipt for X.` used when the model gives no note. */
export function defaultNote(mode: ParseMode, counterpartyName: unknown): string {
  const name = nonBlankString(counterpartyName) ? counterpartyName.trim() : 'counterparty';
  return `Auto-parsed from ${SOURCE_LABEL[mode]} for ${name}.`;
}

/**
 * Port of `AIOrchestratorService._parse_and_validate`: strip fences, parse JSON, normalize the fields
 * (counterparty, category -> id, type, date, note) and validate. Throws `ModelOutputError` when the
 * answer is unusable so the caller can try the next model in the fallback chain.
 */
export function parseModelOutput(rawText: string, ctx: ParseContext): ParsedExpense {
  let data: unknown;
  try {
    data = JSON.parse(stripJsonFences(rawText));
  } catch (err) {
    throw new ModelOutputError('Model returned invalid JSON.', { cause: err });
  }
  if (!isRecord(data)) throw new ModelOutputError('Model returned a non-object payload.');

  const counterpartyName = nonBlankString(data['counterparty_name']) ? data['counterparty_name'].trim() : 'Unknown';
  const rawType = data['counterparty_type'];
  const counterpartyType: ParsedCounterpartyType =
    typeof rawType === 'string' && COUNTERPARTY_SET.has(rawType.trim()) ? (rawType.trim() as ParsedCounterpartyType) : 'merchant';

  const rawCategory = data['category'];
  let category = normalizeCategory(rawCategory, ctx.allowedCategories);
  let categoryId = categoryIdByName(category, ctx.categoryOptions);
  if (categoryId === null && typeof rawCategory === 'string') {
    const coerced = categoryNameById(rawCategory, ctx.categoryOptions);
    if (coerced !== null) {
      category = coerced;
      categoryId = categoryIdByName(coerced, ctx.categoryOptions);
    }
  }

  const rawConfidence = data['confidence'];
  const confidence = typeof rawConfidence === 'string' && rawConfidence.trim() !== '' ? Number(rawConfidence) : rawConfidence;

  const result = expenseSchema.safeParse({
    counterparty_name: counterpartyName,
    counterparty_type: counterpartyType,
    amount: data['amount'],
    type: typeof data['type'] === 'string' ? data['type'].trim().toLowerCase() : data['type'],
    category,
    category_id: categoryId,
    note: nonBlankString(data['note']) ? data['note'] : defaultNote(ctx.mode, counterpartyName),
    confidence,
    raw_model: ctx.model,
  });
  if (!result.success) {
    throw new ModelOutputError(`Parsed payload validation failed: ${result.error.issues.map((i) => i.path.join('.')).join(', ')}`);
  }
  const v = result.data;
  return {
    counterpartyName: v.counterparty_name,
    counterpartyType: v.counterparty_type,
    amount: v.amount,
    type: v.type,
    date: parseModelDate(data['date']),
    category: v.category,
    categoryId: v.category_id,
    note: v.note,
    confidence: v.confidence,
    rawModel: v.raw_model,
  };
}
