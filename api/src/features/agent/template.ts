import type { ToolName } from './tools';

/** One executed (or rejected) tool call of a turn. */
export interface ToolResult {
  name: ToolName;
  /** The validated arguments (normalized), or `{}` when they could not be parsed. */
  args: Record<string, unknown>;
  ok: boolean;
  /** The shaped result the model saw (money has `_display` twins). */
  data: Record<string, unknown> | null;
  error: string | null;
  ms: number;
  rows: number;
  /** Raw numbers only the app blocks need (never shown to the model, never part of verification). */
  blockData?: Record<string, unknown> | null;
}

/**
 * The deterministic answer used when the model cannot be trusted or reached: its figures come straight
 * from the last useful tool result (so they verify by construction). Plain sentences, no markup tricks.
 */

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Rec) : {});
const list = (v: unknown): Rec[] => (Array.isArray(v) ? v.map(rec) : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const disp = (r: Rec, key: string): string => str(r[`${key}_display`]) || str(r[key]);

function span(data: Rec): string {
  const p = rec(data['period']);
  const from = str(p['from']);
  const to = str(p['to']);
  return from === '' ? 'that period' : from === to ? from : `${from} to ${to}`;
}

const pct = (v: unknown): string => (typeof v === 'number' ? `${v}%` : '');

function describe(name: ToolName, data: Rec): string | null {
  switch (name) {
    case 'spending_summary': {
      if (Number(data['count']) === 0) return `I found no transactions for ${span(data)}.`;
      return `For ${span(data)} you spent **${disp(data, 'debit')}** across ${str(data['debit_count'])} transactions and received **${disp(data, 'credit')}** (net ${disp(data, 'net')}).`;
    }
    case 'category_breakdown': {
      const rows = list(data['categories']);
      if (rows.length === 0) return `I found no transactions for ${span(data)}.`;
      const top = rows.slice(0, 5).map((r) => `${str(r['name'])} ${disp(r, 'total')} (${pct(r['share'])})`);
      return `For ${span(data)} the total was **${disp(data, 'total')}**. Biggest categories: ${top.join(', ')}.`;
    }
    case 'top_payees': {
      const rows = list(data['payees']);
      if (rows.length === 0) return `I found no spending for ${span(data)}.`;
      const top = rows.slice(0, 5).map((r) => `${str(r['name'])} ${disp(r, 'total')} (${pct(r['share'])})`);
      return `For ${span(data)} you spent **${disp(data, 'total')}** in total. Top payees: ${top.join(', ')}.`;
    }
    case 'daily_cashflow': {
      const peak = rec(data['peak_debit_day']);
      const tail = str(peak['date']) ? `, with the biggest day on ${str(peak['date'])} (${disp(peak, 'debit')})` : '';
      return `Between ${span(data)} you spent **${disp(data, 'debit_total')}** and received ${disp(data, 'credit_total')}${tail}.`;
    }
    case 'compare_periods': {
      const a = rec(data['a']);
      const b = rec(data['b']);
      const delta = rec(data['delta']);
      const change = typeof delta['debit_pct'] === 'number' ? ` (${delta['debit_pct'] >= 0 ? 'up' : 'down'} ${pct(Math.abs(delta['debit_pct']))})` : '';
      return `Spending was **${disp(a, 'debit')}** for ${span({ period: data['period_a'] })} against **${disp(b, 'debit')}** for ${span({ period: data['period_b'] })}${change}.`;
    }
    case 'budget_status': {
      const monthly = rec(data['monthly']);
      if (str(monthly['budget']) === '') return `You have spent **${disp(data, 'total_spent')}** in ${span(data)}; no monthly budget is set.`;
      const remaining = str(monthly['remaining_display']);
      const left = remaining.startsWith('-') ? `over by ${remaining.slice(1)}` : `${remaining} left`;
      return `You have spent **${disp(monthly, 'spent')}** of your **${disp(monthly, 'budget')}** budget for ${span(data)} (${pct(monthly['pct_used'])} used, ${left}).`;
    }
    case 'list_transactions': {
      const rows = list(data['rows']);
      if (rows.length === 0) return `I found no matching transactions for ${span(data)}.`;
      const lines = rows.slice(0, 5).map((r) => `${str(r['date'])} ${str(r['payee'])} ${disp(r, 'amount')}`);
      return `I found ${str(data['total_count'])} matching transactions for ${span(data)}. First ones: ${lines.join('; ')}.`;
    }
    case 'resolve_entities': {
      const names = list(data['matches']).map((m) => str(m['name']));
      return names.length > 0 ? `The closest matches are ${names.join(', ')}.` : 'I could not find a matching payee or category.';
    }
    case 'run_sql': {
      const rows = list(data['rows']);
      const first = rows[0];
      const cells = first ? Object.entries(first).map(([k, v]) => `${k}: ${str(v)}`).join(', ') : '';
      return `The query returned ${str(data['row_count'])} rows${cells ? `. First row: ${cells}` : ''}.`;
    }
  }
}

export const NO_DATA_ANSWER = "I couldn't get that information right now. Please try again, or ask about your spending in a specific period.";

/** An answer built only from the tool results (the last useful one), or a generic apology when there are none. */
export function templateAnswer(results: readonly ToolResult[]): string {
  for (let i = results.length - 1; i >= 0; i--) {
    const r = results[i];
    if (!r?.ok || !r.data) continue;
    const text = describe(r.name, r.data);
    if (text) return text;
  }
  return NO_DATA_ANSWER;
}
