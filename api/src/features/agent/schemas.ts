import * as z from 'zod';

/* ----------------------------------------------------------------------------------------------
 * HTTP contract: POST /agent/chat
 * -------------------------------------------------------------------------------------------- */

export const chatHistoryMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(8000),
});

export const chatRequestSchema = z.object({
  content: z.string().min(1).max(4000),
  /** IANA timezone from the app, e.g. Asia/Kolkata. */
  timezone: z.string().nullish(),
  /** Prior user/assistant turns from the client session (stateless server). */
  history: z.array(chatHistoryMessageSchema).default([]),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatHistoryMessage = z.infer<typeof chatHistoryMessageSchema>;

export interface ChatResponse {
  answer: string;
  blocks: Record<string, unknown>[];
  deep_link: Record<string, unknown> | null;
}

/** Contract C5: agent failures are an HTTP 200 with this body (the app turns it into an error bubble). */
export interface AgentErrorBody {
  error: { code: string; message: string };
}

/* ----------------------------------------------------------------------------------------------
 * Lenient scalar helpers (the model's JSON is not typed: "2026" for 2026, "12.5" for 12.5)
 * -------------------------------------------------------------------------------------------- */

const intLike = (schema: z.ZodNumber) =>
  z.preprocess((v) => (typeof v === 'string' && /^-?\d+$/.test(v.trim()) ? Number(v) : v), schema);

const numLike = (schema: z.ZodNumber) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : v), schema);

/* ----------------------------------------------------------------------------------------------
 * Mini charts
 * -------------------------------------------------------------------------------------------- */

export const CHART_KINDS = ['cashflow', 'donut', 'compare_bar'] as const;
export type ChartKind = (typeof CHART_KINDS)[number];

export const donutItemSchema = z.object({ name: z.string().min(1).max(120), value: numLike(z.number().gt(0)) });
export const cashflowPointSchema = z.object({ date: z.string().min(8).max(32), amount: numLike(z.number().min(0)) });
export const compareItemSchema = z.object({
  name: z.string().min(1).max(120),
  period_a: numLike(z.number().min(0)),
  period_b: numLike(z.number().min(0)),
});

export interface DonutItem {
  name: string;
  value: number;
}
export interface CashflowPoint {
  date: string;
  amount: number;
}
export interface CompareItem {
  name: string;
  period_a: number;
  period_b: number;
}

export interface MiniChartPayload {
  title?: string;
  series?: DonutItem[];
  points?: CashflowPoint[];
  period_a_label?: string;
  period_b_label?: string;
  compare_series?: CompareItem[];
  /** Added by `enrichCashflowBlocks`. */
  start_date?: string;
  end_date?: string;
}

export interface MiniChartBlock {
  type: 'mini_chart';
  chart_kind: ChartKind;
  payload: MiniChartPayload;
}

/** Strict payload check (port of `MiniChartPayload.model_validate`): any invalid item fails the chart. */
export const miniChartPayloadSchema = z.object({
  title: z.string().max(120).nullish(),
  series: z.array(donutItemSchema).nullish(),
  points: z.array(cashflowPointSchema).nullish(),
  period_a_label: z.string().max(80).nullish(),
  period_b_label: z.string().max(80).nullish(),
  compare_series: z.array(compareItemSchema).nullish(),
});

export const miniChartBlockSchema = z.object({
  type: z.literal('mini_chart').default('mini_chart'),
  chart_kind: z.enum(CHART_KINDS),
  payload: z.record(z.string(), z.unknown()),
});

/** The model's flat chart object (JSON mode). Items are validated one by one by the caller. */
export const llmChartSchema = z.object({
  chart_kind: z.enum(CHART_KINDS),
  title: z.string().nullish(),
  series: z.array(z.unknown()).nullish(),
  points: z.array(z.unknown()).nullish(),
  period_a_label: z.string().nullish(),
  period_b_label: z.string().nullish(),
  compare_series: z.array(z.unknown()).nullish(),
});
export type LlmChart = z.infer<typeof llmChartSchema>;

/* ----------------------------------------------------------------------------------------------
 * Deep links (TransactionsList navigation)
 * -------------------------------------------------------------------------------------------- */

const yearSchema = intLike(z.number().int().min(2000).max(2100));
const monthIndexSchema = intLike(z.number().int().min(0).max(11));
const isoStamp = z.string().min(10).max(64);

const isoPair = <T extends { fromIso?: string | null | undefined; toIso?: string | null | undefined }>(p: T) =>
  (p.fromIso == null) === (p.toIso == null);
const PAIR_MSG = 'fromIso and toIso must both be set or both omitted';

const dayParamsSchema = z.object({
  filter: z.literal('day'),
  year: yearSchema,
  monthIndex0: monthIndexSchema,
  dayKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const categoryParamsSchema = z
  .object({
    filter: z.literal('category'),
    year: yearSchema,
    monthIndex0: monthIndexSchema,
    categoryId: z.string().min(36).max(36),
    categoryDisplayName: z.string().min(1).max(120),
    fromIso: isoStamp.nullish(),
    toIso: isoStamp.nullish(),
  })
  .refine(isoPair, PAIR_MSG);

const payeeParamsSchema = z
  .object({
    filter: z.literal('payee'),
    year: yearSchema,
    monthIndex0: monthIndexSchema,
    payeeId: z.string().min(1).max(120).nullish(),
    payeeKey: z.string().min(1).max(120).nullish(),
    payeeDisplayName: z.string().min(1).max(120),
    payeeKeysTop: z.array(z.string()).max(20).default([]),
    fromIso: isoStamp.nullish(),
    toIso: isoStamp.nullish(),
  })
  .refine((p) => (p.payeeId || p.payeeKey || '').trim() !== '', 'payeeId is required')
  .refine(isoPair, PAIR_MSG)
  .transform((p) => {
    const resolved = (p.payeeId || p.payeeKey || '').trim();
    return { ...p, payeeId: resolved, payeeKey: resolved };
  });

export const deepLinkSchema = z.object({
  screen: z.literal('TransactionsList').default('TransactionsList'),
  label: z.string().max(120).nullish(),
  params: z.discriminatedUnion('filter', [dayParamsSchema, categoryParamsSchema, payeeParamsSchema]),
});

export type DeepLink = Record<string, unknown>;

/** Python `model_dump(exclude_none=True)`: drop null/undefined keys (shallow, per object). */
export function excludeNone<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined));
}

/** The model's flat deep link; resolved/validated later by `deep-link.ts`. */
export const llmDeepLinkSchema = z.object({
  filter: z.enum(['day', 'category', 'payee']),
  label: z.string().nullish(),
  year: intLike(z.number().int()),
  monthIndex0: intLike(z.number().int()),
  dayKey: z.string().nullish(),
  categoryId: z.string().nullish(),
  categoryDisplayName: z.string().nullish(),
  payeeId: z.string().nullish(),
  payeeDisplayName: z.string().nullish(),
  payeeKeysTop: z.array(z.string()).nullish(),
  fromIso: z.string().nullish(),
  toIso: z.string().nullish(),
});
export type LlmDeepLink = z.infer<typeof llmDeepLinkSchema>;

/* ----------------------------------------------------------------------------------------------
 * LLM structured outputs (JSON mode)
 * -------------------------------------------------------------------------------------------- */

export const periodInputSchema = z.object({
  year: intLike(z.number().int()),
  month: intLike(z.number().int()).nullish(),
  ytd: z.boolean().nullish(),
});

export const classifyOutputSchema = z.object({
  comparison_kind: z.enum(['month_pair', 'year_pair']).nullish(),
  period_a: periodInputSchema.nullish(),
  period_b: periodInputSchema.nullish(),
});
export type ClassifyOutput = z.infer<typeof classifyOutputSchema>;

export const sqlOutputSchema = z.object({ sql: z.string() });

/** Respond output: `chart` is the current shape; `blocks` (legacy `mini_chart` list) is still accepted. */
export const respondOutputSchema = z.object({
  answer: z.string().trim().min(1),
  chart: z.unknown().optional(),
  blocks: z.array(z.unknown()).nullish(),
  deep_link: z.unknown().optional(),
});
export type RespondOutput = z.infer<typeof respondOutputSchema>;

/* ----------------------------------------------------------------------------------------------
 * SQL attempt log
 * -------------------------------------------------------------------------------------------- */

export interface SqlAttempt {
  sql: string;
  row_count: number;
  error: string | null;
  elapsed_ms: number;
  round: number;
}
