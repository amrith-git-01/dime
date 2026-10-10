import * as z from 'zod';

/* ----------------------------------------------------------------------------------------------
 * HTTP contract C9: POST /agent/chat and POST /agent/feedback
 * -------------------------------------------------------------------------------------------- */

const chatHistoryMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(8000),
});

export const chatRequestSchema = z.object({
  content: z.string().min(1).max(4000),
  /** IANA timezone from the app, e.g. Asia/Kolkata. */
  timezone: z.string().max(80).nullish(),
  /** Prior turns from the client session. Only the user's text is ever used (never the assistant's). */
  history: z.array(chatHistoryMessageSchema).default([]),
  /** The `memory` token of the previous response, returned unchanged. */
  memory: z.string().max(4096).nullish(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

/** The `ChatResponse` of contract C5 (the Python shape). */
interface ChatResponse {
  answer: string;
  blocks: Record<string, unknown>[];
  deep_link: Record<string, unknown> | null;
}

/** C9: the response carries the signed memory and the id feedback refers to. */
export interface AgentResponse extends ChatResponse {
  memory: string;
  turn_id: string;
}

/** Contract C5: agent failures are an HTTP 200 with this body (and an `error` SSE event with the same payload). */
export interface AgentErrorBody {
  error: { code: string; message: string };
}

export const feedbackRequestSchema = z.object({
  turn_id: z.guid(),
  rating: z.enum(['up', 'down']),
  comment: z.string().trim().max(1000).nullish(),
});

/* ----------------------------------------------------------------------------------------------
 * Mini charts
 * -------------------------------------------------------------------------------------------- */

type ChartKind = 'cashflow' | 'donut' | 'compare_bar';

const donutItemSchema = z.object({ name: z.string().min(1).max(120), value: z.number().gt(0) });
const cashflowPointSchema = z.object({ date: z.string().min(8).max(32), amount: z.number().min(0) });
const compareItemSchema = z.object({
  name: z.string().min(1).max(120),
  period_a: z.number().min(0),
  period_b: z.number().min(0),
});

interface DonutItem {
  name: string;
  value: number;
}
interface CashflowPoint {
  date: string;
  amount: number;
}
interface CompareItem {
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
}

export interface MiniChartBlock {
  type: 'mini_chart';
  chart_kind: ChartKind;
  payload: MiniChartPayload;
}

/** Strict payload check: any invalid item fails the chart. */
export const miniChartPayloadSchema = z.object({
  title: z.string().max(120).nullish(),
  series: z.array(donutItemSchema).nullish(),
  points: z.array(cashflowPointSchema).nullish(),
  period_a_label: z.string().max(80).nullish(),
  period_b_label: z.string().max(80).nullish(),
  compare_series: z.array(compareItemSchema).nullish(),
});

/* ----------------------------------------------------------------------------------------------
 * Deep links (TransactionsList navigation)
 * -------------------------------------------------------------------------------------------- */

const yearSchema = z.number().int().min(2000).max(2100);
const monthIndexSchema = z.number().int().min(0).max(11);
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
