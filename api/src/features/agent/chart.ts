import type { ZodType } from 'zod';

import { validateDeepLink } from './deep-link';
import { MAX_DAILY_COMPARISON_DAYS } from './time-range';
import {
  cashflowPointSchema,
  compareItemSchema,
  donutItemSchema,
  llmChartSchema,
  llmDeepLinkSchema,
  miniChartBlockSchema,
  miniChartPayloadSchema,
  respondOutputSchema,
} from './schemas';
import type { DeepLink, LlmChart, LlmDeepLink, MiniChartBlock, MiniChartPayload } from './schemas';

/** Output the model produced is unusable (not JSON, wrong shape). The caller may retry another model. */
export class ModelOutputError extends Error {
  override name = 'ModelOutputError';
}

const MAX_DONUT_SLICES = 8;
const MAX_COMPARE_ROWS = 8;

const JSON_BLOCK_RE = /```(?:json)?\s*([\s\S]*?)```/i;

/** Pull the JSON object out of a model answer: fenced block, bare object, or the outermost braces. */
export function extractJsonObject(text: string): string {
  const cleaned = text.trim();
  const block = JSON_BLOCK_RE.exec(cleaned);
  if (block) return (block[1] ?? '').trim();
  if (cleaned.startsWith('{')) return cleaned;
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) return cleaned.slice(start, end + 1);
  return cleaned;
}

export function parseModelJson(text: string): unknown {
  try {
    return JSON.parse(extractJsonObject(text));
  } catch (err) {
    throw new ModelOutputError('Model output is not valid JSON.', { cause: err });
  }
}

/** Items that pass `schema`, in order; invalid ones are dropped instead of failing the whole answer. */
function validItems<T>(schema: ZodType<T>, raw: readonly unknown[] | null | undefined): T[] {
  const out: T[] = [];
  for (const item of raw ?? []) {
    const parsed = schema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/**
 * Re-validate a chart payload and normalize it per kind (port of `_validate_mini_chart`): donut keeps
 * 8 slices, compare_bar 8 rows with default labels, cashflow at most 40 points. Null when the payload
 * is invalid or has nothing to draw.
 */
export function validateMiniChart(block: { chart_kind: MiniChartBlock['chart_kind']; payload: Record<string, unknown> }): MiniChartBlock | null {
  const parsed = miniChartPayloadSchema.safeParse(block.payload);
  if (!parsed.success) return null;
  const p = parsed.data;
  const title = p.title ?? undefined;

  if (block.chart_kind === 'donut') {
    const series = p.series ?? [];
    if (series.length === 0) return null;
    return { type: 'mini_chart', chart_kind: 'donut', payload: compact({ title, series: series.slice(0, MAX_DONUT_SLICES) }) };
  }
  if (block.chart_kind === 'compare_bar') {
    const compare = p.compare_series ?? [];
    if (compare.length === 0) return null;
    return {
      type: 'mini_chart',
      chart_kind: 'compare_bar',
      payload: compact({
        title,
        period_a_label: p.period_a_label || 'Period A',
        period_b_label: p.period_b_label || 'Period B',
        compare_series: compare.slice(0, MAX_COMPARE_ROWS),
      }),
    };
  }
  const points = p.points ?? [];
  if (points.length === 0) return null;
  return {
    type: 'mini_chart',
    chart_kind: 'cashflow',
    payload: compact({ title, points: points.slice(0, MAX_DAILY_COMPARISON_DAYS) }),
  };
}

function compact(payload: MiniChartPayload): MiniChartPayload {
  return Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined && v !== null));
}

/** The model's flat chart object to a validated block (null when it has nothing drawable). */
export function chartToBlock(chart: LlmChart | null | undefined): MiniChartBlock | null {
  if (!chart) return null;
  const payload: Record<string, unknown> = {};
  if (chart.title != null) payload['title'] = chart.title;

  if (chart.chart_kind === 'donut') {
    const series = validItems(donutItemSchema, chart.series).slice(0, MAX_DONUT_SLICES);
    if (series.length === 0) return null;
    payload['series'] = series;
  } else if (chart.chart_kind === 'cashflow') {
    const points = validItems(cashflowPointSchema, chart.points).slice(0, MAX_DAILY_COMPARISON_DAYS);
    if (points.length === 0) return null;
    payload['points'] = points;
  } else {
    const compare = validItems(compareItemSchema, chart.compare_series).slice(0, MAX_COMPARE_ROWS);
    if (compare.length === 0) return null;
    if (chart.period_a_label) payload['period_a_label'] = chart.period_a_label;
    if (chart.period_b_label) payload['period_b_label'] = chart.period_b_label;
    payload['compare_series'] = compare;
  }
  return validateMiniChart({ chart_kind: chart.chart_kind, payload });
}

/**
 * Flatten the model's deep link to the `{screen, label, params}` shape `validateDeepLink` expects.
 * Accepts the nested shape too (`{screen, label, params: {...}}`).
 */
export function deepLinkToDict(raw: unknown): DeepLink | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj['params'] === 'object' && obj['params'] !== null) return obj;

  const parsed = llmDeepLinkSchema.safeParse(raw);
  if (!parsed.success) return null;
  const dl: LlmDeepLink = parsed.data;
  const params: Record<string, unknown> = { filter: dl.filter, year: dl.year, monthIndex0: dl.monthIndex0 };
  if (dl.filter === 'day') {
    if (dl.dayKey) params['dayKey'] = dl.dayKey;
  } else if (dl.filter === 'category') {
    if (dl.categoryId) params['categoryId'] = dl.categoryId;
    if (dl.categoryDisplayName) params['categoryDisplayName'] = dl.categoryDisplayName;
    if (dl.fromIso) params['fromIso'] = dl.fromIso;
    if (dl.toIso) params['toIso'] = dl.toIso;
  } else {
    if (dl.payeeId) params['payeeId'] = dl.payeeId;
    if (dl.payeeDisplayName) params['payeeDisplayName'] = dl.payeeDisplayName;
    params['payeeKeysTop'] = dl.payeeKeysTop ?? [];
    if (dl.fromIso) params['fromIso'] = dl.fromIso;
    if (dl.toIso) params['toIso'] = dl.toIso;
  }
  return { screen: 'TransactionsList', label: dl.label ?? null, params };
}

export interface ParsedRespond {
  answer: string;
  /** At most one chart. */
  blocks: MiniChartBlock[];
  /** Normalized `{screen, label, params}` before id resolution (null when absent or unusable). */
  deepLink: DeepLink | null;
}

/**
 * Parse the respond step's JSON (port of `parse_respond_json`, extended to the flat `chart` shape).
 * Throws `ModelOutputError` when there is no usable `answer`.
 */
export function parseRespondJson(text: string): ParsedRespond {
  const data = parseModelJson(text);
  const parsed = respondOutputSchema.safeParse(data);
  if (!parsed.success) throw new ModelOutputError('Model output has no usable answer.');
  const raw = parsed.data;

  let block: MiniChartBlock | null = null;
  if (raw.chart != null) {
    const chart = llmChartSchema.safeParse(raw.chart);
    if (chart.success) block = chartToBlock(chart.data);
  }
  if (block === null) {
    // Legacy shape: `blocks: [{type: 'mini_chart', chart_kind, payload}]`, first valid one wins.
    for (const candidate of raw.blocks ?? []) {
      const b = miniChartBlockSchema.safeParse(candidate);
      if (!b.success) continue;
      const validated = validateMiniChart(b.data);
      if (validated) {
        block = validated;
        break;
      }
    }
  }
  return {
    answer: raw.answer.trim(),
    blocks: block ? [block] : [],
    deepLink: validateDeepLink(deepLinkToDict(raw.deep_link)),
  };
}
