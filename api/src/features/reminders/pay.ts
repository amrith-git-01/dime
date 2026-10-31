import { Hono } from 'hono';
import type { Context } from 'hono';

import { decimalToCents, formatCents } from '../../core/decimal';
import type { AppBindings } from '../../core/env';
import { rateLimit } from '../../core/rate-limit';
import { formatInrCents } from '../notifications/emitter';
import { UPI_ID_RE } from './schemas';

/**
 * Public `GET /pay` (mounted on the root app, NOT under /api/v1, no auth): a shared pay link. WhatsApp does not linkify
 * `upi://`, so the app shares this https link and the page offers a button that opens the visitor's UPI app (a tap, never an
 * automatic redirect: anyone can craft a link, so the page also says it was not created by Dime). It runs no script. Nothing is
 * stored, no cookies, no third-party assets. Every query parameter is validated against a strict allow-list before it is used, then URL-encoded
 * in the `upi://` link and HTML-escaped in the page; unvalidated input is never echoed.
 */
export const payRoutes = new Hono<AppBindings>();

/** `am` bounds, in cents: 0.01 to 1,000,000. */
const MIN_CENTS = 1;
const MAX_CENTS = 100_000_000;
const AMOUNT_RE = /^\d{1,7}(?:\.\d{1,2})?$/;
const NAME_RE = /^[\p{L}\p{N} .-]{1,40}$/u;
/** A payee name that poses as the app is refused: the page would lend a crafted link Dime's credibility. */
const IMPERSONATION_RE = /dime/i;
const NOTE_RE = /^[\p{L}\p{N} .,\-_'#&()/:@!?%+*]{1,80}$/u;

export interface PayParams {
  pa: string;
  /** Canonical `500.00`, absent when the link has no amount. */
  am: string | undefined;
  pn: string | undefined;
  tn: string | undefined;
}

/** The validated link parameters, or null when any present one is invalid. An empty optional parameter counts as absent. */
export function parsePayQuery(query: Record<string, string | undefined>): PayParams | null {
  const pa = (query['pa'] ?? '').trim();
  if (!UPI_ID_RE.test(pa)) return null;

  let am: string | undefined;
  const rawAmount = (query['am'] ?? '').trim();
  if (rawAmount !== '') {
    if (!AMOUNT_RE.test(rawAmount)) return null;
    const cents = decimalToCents(rawAmount);
    if (cents < MIN_CENTS || cents > MAX_CENTS) return null;
    am = formatCents(cents);
  }

  const optional = (key: string, re: RegExp): string | undefined | null => {
    const value = (query[key] ?? '').trim();
    if (value === '') return undefined;
    return re.test(value) ? value : null;
  };
  const pn = optional('pn', NAME_RE);
  const tn = optional('tn', NOTE_RE);
  if (pn === null || tn === null || (pn !== undefined && IMPERSONATION_RE.test(pn))) return null;
  return { pa, am, pn, tn };
}

const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string);

const enc = (value: string): string => encodeURIComponent(value);

/** The `upi://pay` deep link. The UPI id keeps its `@` (apps expect it); every other value is percent-encoded. */
export function upiLink(p: PayParams): string {
  const parts = [`pa=${enc(p.pa).replace(/%40/g, '@')}`];
  if (p.pn) parts.push(`pn=${enc(p.pn)}`);
  if (p.am) parts.push(`am=${p.am}`);
  parts.push('cu=INR');
  if (p.tn) parts.push(`tn=${enc(p.tn)}`);
  return `upi://pay?${parts.join('&')}`;
}

function nonce(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
}

const STYLE = `
:root{color-scheme:light dark;--bg:#f6f7f9;--card:#fff;--ink:#14161a;--muted:#5d6470;--accent:#0f766e;--line:#e3e6ea}
@media (prefers-color-scheme:dark){:root{--bg:#0e1013;--card:#171a1f;--ink:#f2f4f7;--muted:#9aa3af;--accent:#2dd4bf;--line:#272c33}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{width:100%;max-width:380px;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:24px;text-align:center}
h1{margin:0 0 4px;font-size:22px;line-height:1.3;overflow-wrap:anywhere}
p{margin:0 0 16px;color:var(--muted);overflow-wrap:anywhere}
.btn{display:block;padding:14px 16px;border-radius:12px;background:var(--accent);color:#04201d;font-weight:600;text-decoration:none}
.id{margin:20px 0 0;font-size:14px}
code{color:var(--ink);overflow-wrap:anywhere}
.warn{margin:20px 0 0;padding:10px 12px;border:1px solid var(--line);border-radius:10px;font-size:14px;color:var(--ink)}
`;

/** Shown on every valid page: a pay link can be made by anyone, so the visitor must check the UPI id. */
export const NOT_FROM_DIME_NOTICE = 'This link was not created by Dime. Check the UPI ID before paying.';

function page(n: string, title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title><style nonce="${n}">${STYLE}</style></head><body>${body}</body></html>`;
}

/** The "Pay ₹500 to Ravi" page for validated parameters. */
export function renderPayPage(p: PayParams, n: string): string {
  const amount = p.am ? formatInrCents(decimalToCents(p.am)) : null;
  const heading = amount ? (p.pn ? `Pay ${amount} to ${p.pn}` : `Pay ${amount}`) : p.pn ? `Pay ${p.pn}` : 'Pay with UPI';
  const note = p.tn ? `<p>${escapeHtml(p.tn)}</p>` : '';
  const body =
    `<main><h1>${escapeHtml(heading)}</h1>${note}<a class="btn" href="${escapeHtml(upiLink(p))}">Open your UPI app</a>` +
    `<p class="id">UPI ID: <code>${escapeHtml(p.pa)}</code></p><p class="warn">${NOT_FROM_DIME_NOTICE}</p></main>`;
  return page(n, heading, body);
}

export function renderInvalidPage(n: string): string {
  return page(n, 'Invalid payment link', "<main><h1>This payment link isn't valid</h1><p>Ask the sender for a new link.</p></main>");
}

function respond(c: Context<AppBindings>, html: (n: string) => string, status: 200 | 400) {
  const n = nonce();
  return c.html(html(n), status, {
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': `default-src 'none'; style-src 'nonce-${n}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
  });
}

// Rate limited per client IP by the shared write limiter (a cost guard; the page itself does no I/O).
payRoutes.get('/', rateLimit('WRITE_LIMITER'), (c) => {
  const params = parsePayQuery(c.req.query());
  return params ? respond(c, (n) => renderPayPage(params, n), 200) : respond(c, renderInvalidPage, 400);
});
