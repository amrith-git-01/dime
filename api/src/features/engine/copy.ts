import * as z from 'zod';

import { formatInr } from '../agent/money';

/**
 * Template text for the forecast cards. Code fills every number in; the nightly labeller (labeller.ts) lets DeepSeek
 * rewrite the sentences with `{amount}`-style placeholders and the forecast falls back to these whenever the model is
 * unavailable or breaks the placeholder rule (`renderTemplate`, at the end of this file).
 */

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Exact rupees with Indian grouping: Rs 4,000 / Rs 119.50. */
export const inr = (paise: number): string => formatInr(Math.round(paise) / 100);

/** Rounded for forecasts: Rs 4,500 under Rs 10,000, then Rs 28.9k and Rs 1.2L. */
export function inrCompact(paise: number): string {
  const rupees = Math.round(paise) / 100;
  if (Math.abs(rupees) < 10_000) return formatInr(Math.round(rupees));
  const trim = (n: number) => String(Math.round(n * 10) / 10);
  return Math.abs(rupees) < 100_000 ? `₹${trim(rupees / 1000)}k` : `₹${trim(rupees / 100_000)}L`;
}

export function categoryHotText(input: { category: string; p50: number; baseline: number; driver: { name: string; amount: number } | null }): string {
  const lead = `${input.category} is heading for ${inrCompact(input.p50)}; you usually spend ${inrCompact(input.baseline)}.`;
  return input.driver ? `${lead} Most of it so far is ${input.driver.name} (${inrCompact(input.driver.amount)}).` : lead;
}

export function categoryOverText(input: { category: string; p50: number; budget: number; driver: { name: string; amount: number } | null }): string {
  const lead = `${input.category} is heading for ${inrCompact(input.p50)}, over its ${inrCompact(input.budget)} budget.`;
  return input.driver ? `${lead} Most of it so far is ${input.driver.name} (${inrCompact(input.driver.amount)}).` : lead;
}

/** How many times the usual a spend is: a whole number from 10x ("12"), otherwise one decimal ("3.2"); 0 when there is no usual. */
export function unusualRatio(amount: number, usual: number): number {
  if (usual <= 0) return 0;
  const times = amount / usual;
  return times >= 10 ? Math.round(times) : Math.round(times * 10) / 10;
}

/** `basis` says what the spend was compared with: the payee's own history, or (a payee seen too few times) the category's. */
export function unusualText(input: { amount: number; payee: string; usual: number; basis?: 'payee' | 'category'; category?: string }): string {
  const lead = `${inr(input.amount)} at ${input.payee} is about ${unusualRatio(input.amount, input.usual)}x your usual`;
  if (input.basis !== 'category') return `${lead} there.`;
  return `${lead} ${input.category ? `${input.category} spend` : 'spend in this category'}.`;
}

/** Whole rupees in paise (a subscription's usual charge is shown without paise). */
export const wholeRupees = (paise: number): number => Math.round(paise / 100) * 100;

export function subscriptionCandidateText(input: { name: string; amount: number; yearly: boolean }): string {
  return `${input.name}, ${inr(wholeRupees(input.amount))} ${input.yearly ? 'yearly' : 'monthly'}. Track it as recurring?`;
}

export interface SummaryInput {
  mode: 'learning' | 'warming' | 'full';
  historyDays: number;
  p50: number;
  budget: number | null;
  chanceUnder: number | null;
  /** The category to point at: the worst running hot or over. */
  watchCategory: string | null;
  spentSoFar: number;
}

/** Chance of staying under budget from which the month reads "on track", and from which "close call". */
const ON_TRACK_CHANCE = 0.7;
const CLOSE_CALL_CHANCE = 0.4;

/** One line for the top of Analytics. */
export function summaryText(input: SummaryInput): string {
  if (input.mode === 'learning') {
    return `Learning your patterns (${Math.min(input.historyDays, 30)} of 30 days). ${inr(input.spentSoFar)} spent so far this month.`;
  }
  const watch = input.watchCategory ? ` Watch ${input.watchCategory}.` : '';
  if (input.budget === null || input.chanceUnder === null) return `On pace for about ${inrCompact(input.p50)} this month.${watch}`;
  const against = `likely ${inrCompact(input.p50)} against ${inrCompact(input.budget)}`;
  if (input.chanceUnder >= ON_TRACK_CHANCE) return `On track: ${against}.${watch}`;
  if (input.chanceUnder >= CLOSE_CALL_CHANCE) return `Close call: ${against}.${watch}`;
  return `Heading over budget: ${against}.${watch}`;
}

export function pastMonthText(input: { month: number; spent: number; budget: number | null }): string {
  const name = MONTH_NAMES[input.month - 1] ?? '';
  if (input.budget === null) return `You spent ${inrCompact(input.spent)} in ${name}.`;
  return `You spent ${inrCompact(input.spent)} in ${name}, ${input.spent <= input.budget ? 'within' : 'over'} the ${inrCompact(input.budget)} budget.`;
}

/* ----------------------------------------------------------------------------------------------
 * Model-written copy
 * -------------------------------------------------------------------------------------------- */

/** What the labeller may rewrite for one watch card: which card, and the formatted values its placeholders stand for. */
export interface CopyTarget {
  /** The watch item's id (`hot:<category>`, `unusual:<transaction>`, `sub:<payee>`). */
  id: string;
  kind: 'category_hot' | 'unusual' | 'subscription_candidate';
  /** What the card says in a word (`hot`, `over`, `unusual`, `monthly`...), for the prompt. */
  variant: string;
  /** The category or payee the card is about, for the prompt. */
  label: string;
  /** Placeholder name -> text. The template may only use these names. */
  values: Record<string, string>;
}

export interface CopyTargets {
  /** Null while learning (that line is informational and stays a template). */
  summary: { situation: string; values: Record<string, string> } | null;
  watch: CopyTarget[];
}

/** `engine_patterns.copy` as the labeller stores it. */
export const storedCopySchema = z.object({
  summary: z.object({ situation: z.string(), template: z.string() }).optional(),
  watch: z.record(z.string(), z.string()).optional(),
});
export type StoredCopy = z.infer<typeof storedCopySchema>;

export function parseStoredCopy(raw: string | null | undefined): StoredCopy | null {
  if (!raw) return null;
  try {
    const parsed = storedCopySchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * The summary line's situation and placeholder values: the band `summaryText` writes for, plus `_watch` when it also
 * points at a category. A model template is only used when the situation it was written for is still today's.
 */
export function summaryTarget(input: SummaryInput): CopyTargets['summary'] {
  if (input.mode === 'learning') return null;
  const values: Record<string, string> = { landing: inrCompact(input.p50), spent: inr(input.spentSoFar) };
  let band = 'pace';
  if (input.budget !== null && input.chanceUnder !== null) {
    values['budget'] = inrCompact(input.budget);
    values['chance'] = `${Math.round(input.chanceUnder * 100)}%`;
    band = input.chanceUnder >= ON_TRACK_CHANCE ? 'on_track' : input.chanceUnder >= CLOSE_CALL_CHANCE ? 'close_call' : 'over';
  }
  if (input.watchCategory) values['category'] = input.watchCategory;
  return { situation: input.watchCategory ? `${band}_watch` : band, values };
}

const MAX_TEMPLATE_LENGTH = 160;
const PLACEHOLDER = /\{([A-Za-z]+)\}/g;
/** Placeholder glued to a letter or to another placeholder ("Food{category}", "{a}{b}"). */
const GLUED_PLACEHOLDER = /[A-Za-z]\{|\}[A-Za-z]|\}\{/;
/** The only text a template may hold besides placeholders: Latin letters, spaces and plain punctuation. No digits of any script, no symbols, no markup, no links. */
const ALLOWED_TEXT = /^[A-Za-z .,;'’!?()–—-]*$/;
/** Number words (English and Hinglish), currency words and percent: a number must come from a placeholder. "do" is left out (it is English too). */
const NUMBER_WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen',
  'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty',
  'ninety', 'hundred', 'thousand', 'lakh', 'lac', 'crore', 'million', 'billion', 'dozen', 'half', 'halves', 'quarter', 'double',
  'triple', 'twice', 'once', 'thrice', 'percent', 'rupee', 'rs', 'inr', 'ek', 'teen', 'char', 'paanch', 'das', 'sau', 'hazaar', 'hazar',
];
const FORBIDDEN_WORDS = new RegExp(String.raw`\b(?:${NUMBER_WORDS.join('|')})(?:e?s)?\b`, 'i');
/** Things a prompt-injected note could make the model write: links, UPI and web addresses. */
const SUSPICIOUS = /\bhttps?|\bwww|\bupi\b|\.(?:com|in)\b/i;

/** The key a watch card's template is stored under: the card and the variant it was written for (an `over` card must not reuse a `hot` text). */
export const copyKey = (id: string, variant: string): string => `${id}|${variant}`;

/**
 * The placeholder guard (docs/PREDICTIVE-ENGINE-PLAN.md section 7): fills a model-written sentence with `values`, or returns
 * null when it cannot be trusted, and the caller keeps the code template. Besides placeholders a template may hold only
 * Latin letters, spaces and . , ; ' ! ? - ( ) and dashes, and no number word or link-like word, so every number the user
 * reads was put in by code. It must use at least one placeholder, each name once, each set off from letters and from other
 * placeholders, every name must have a value, and it may not be empty or over 160 characters.
 */
export function renderTemplate(template: string, values: Readonly<Record<string, string>>): string | null {
  const text = template.trim();
  if (text === '' || text.length > MAX_TEMPLATE_LENGTH || GLUED_PLACEHOLDER.test(text)) return null;
  const names = [...text.matchAll(PLACEHOLDER)].map((m) => m[1] as string);
  if (names.length === 0 || new Set(names).size !== names.length) return null;
  const bare = text.replace(PLACEHOLDER, ' ');
  if (!ALLOWED_TEXT.test(bare) || FORBIDDEN_WORDS.test(bare) || SUSPICIOUS.test(bare)) return null;
  if (!names.every((n) => Object.hasOwn(values, n))) return null;
  return text.replace(PLACEHOLDER, (_, name: string) => values[name] as string);
}

/** Whether `template` would render if every name in `names` had a value (the labeller checks this before it stores one). */
export const isUsableTemplate = (template: string, names: readonly string[]): boolean =>
  renderTemplate(template, Object.fromEntries(names.map((n) => [n, 'x']))) !== null;
