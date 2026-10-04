import { fetchJson } from '../../core/http';
import { log } from '../../core/logging';

/** The quote shown in emails: FavQs "money" quotes with a short timeout, a fixed pool as fallback. */

export type Quote = readonly [text: string, author: string];

const MAX_BODY_LEN = 180;
const FAVQS_URL = 'https://favqs.com/api/quotes';
const FAVQS_TIMEOUT_MS = 2000;

export const FALLBACK_QUOTES: readonly Quote[] = [
  ['Beware of little expenses; a small leak will sink a great ship.', 'Benjamin Franklin'],
  [
    'The cost of a thing is the amount of what I will call life which is required to be exchanged for it.',
    'Henry David Thoreau',
  ],
  ['A budget is telling your money where to go instead of wondering where it went.', 'John C. Maxwell'],
  ['Annual income twenty pounds, annual expenditure nineteen nineteen and six, result happiness.', 'Charles Dickens'],
];

/** Short quotes with a body and an author; everything else in the payload is ignored. */
export function parseFavqsQuotes(payload: unknown): Quote[] {
  const rows = (payload as { quotes?: unknown } | null)?.quotes;
  if (!Array.isArray(rows)) return [];
  const out: Quote[] = [];
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue;
    const { body, author } = row as { body?: unknown; author?: unknown };
    if (typeof body !== 'string' || typeof author !== 'string') continue;
    const text = body.trim();
    const who = author.trim();
    if (!text || !who || text.length > MAX_BODY_LEN) continue;
    out.push([text, who]);
  }
  return out;
}

export function pickQuote(quotes: readonly Quote[], random: () => number = Math.random): Quote {
  const pool = quotes.length > 0 ? quotes : FALLBACK_QUOTES;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))] as Quote;
}

/** Fetch the money-quote page; any failure (or no key) yields the fallback pool. Never throws. */
export async function fetchMoneyQuotes(apiKey: string | undefined): Promise<Quote[]> {
  const key = apiKey?.trim();
  if (!key) return [...FALLBACK_QUOTES];
  try {
    const payload = await fetchJson(`${FAVQS_URL}?${new URLSearchParams({ filter: 'money', type: 'tag' }).toString()}`, {
      upstream: 'favqs',
      timeoutMs: FAVQS_TIMEOUT_MS,
      retries: 0,
      headers: { authorization: `Token token="${key}"`, accept: 'application/json' },
    });
    const parsed = parseFavqsQuotes(payload);
    return parsed.length > 0 ? parsed : [...FALLBACK_QUOTES];
  } catch (err) {
    log.warn('favqs_quote_fetch_failed', { err: String(err) });
    return [...FALLBACK_QUOTES];
  }
}

/** One lazily-loaded quote page shared by every email of a batch (one FavQs call, many random picks). */
export function createQuoteSource(apiKey: string | undefined, random: () => number = Math.random): () => Promise<Quote> {
  let page: Promise<Quote[]> | undefined;
  return async () => pickQuote(await (page ??= fetchMoneyQuotes(apiKey)), random);
}
