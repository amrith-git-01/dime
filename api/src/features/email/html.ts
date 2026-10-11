/**
 * Email HTML (port of `features/email/html.py`): inline-styled tables that survive Gmail and Outlook.
 * Output is byte-for-byte what Python produced for the same inputs, apart from float formatting
 * differences in edge cases.
 */

const PAPER = '#FAFAFA';
const SURFACE = '#FFFFFF';
const INK = '#14151A';
const INK_SOFT = '#5B5D68';
const INK_FAINT = '#A0A2AD';
const LINE = '#EAEAEC';
const ACCENT = '#2B3FE0';
const SUCCESS = '#1A8754';
const DANGER = '#D6394A';
const SUNKEN = '#F1F1F3';

const FONT = "'Hanken Grotesk', system-ui, -apple-system, Segoe UI, sans-serif";

/** Python `html.escape(s)` (quote=True). */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}
const esc = escapeHtml;

/** Python `round()` on a float: ties go to the even integer. */
export function roundHalfEven(x: number): number {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

const groupThousands = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** `₹12,430` for whole rupees, `₹12,430.50` otherwise (western grouping, as Python's `:,`). */
export function formatInr(raw: string | number): string {
  let value = Number(raw);
  if (!Number.isFinite(value)) value = 0;
  const sign = value < 0 ? '-' : '';
  const n = Math.abs(value);
  if (Math.abs(n - Math.round(n)) < 0.005) return `${sign}₹${groupThousands(String(Math.round(n)))}`;
  const [whole = '0', frac = '00'] = n.toFixed(2).split('.');
  return `${sign}₹${groupThousands(whole)}.${frac}`;
}

function wrap(inner: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet"/>
<title>Dime</title>
</head>
<body style="margin:0;padding:0;background:${PAPER};font-family:${FONT};color:${INK};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
${inner}
</table>
</td></tr>
</table>
</body>
</html>`;
}

const wordmark = () =>
  `<tr><td style="padding:0 8px 24px;letter-spacing:0.28em;font-size:12px;font-weight:700;color:${INK};">DIME</td></tr>`;

const kicker = (text: string) =>
  `<tr><td style="padding:0 8px 8px;font-size:11px;font-weight:600;letter-spacing:0.18em;color:${INK_FAINT};">${esc(text)}</td></tr>`;

const hero = (text: string) =>
  `<tr><td style="padding:0 8px 16px;font-size:32px;line-height:40px;font-weight:700;letter-spacing:-0.02em;color:${INK};">${esc(text)}</td></tr>`;

const body = (text: string) =>
  `<tr><td style="padding:0 8px 24px;font-size:16px;line-height:24px;color:${INK_SOFT};">${esc(text)}</td></tr>`;

function quote(text: string, attribution?: string | null): string {
  const credit = attribution
    ? `<div style="margin-top:12px;font-size:11px;font-weight:600;letter-spacing:0.14em;font-style:normal;color:${INK_FAINT};">${esc(attribution)}</div>`
    : '';
  return (
    `<tr><td style="padding:0 0 24px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SURFACE};border-radius:24px;">` +
    `<tr><td style="padding:24px 28px;border-left:3px solid ${LINE};font-size:18px;line-height:28px;font-style:italic;color:${INK};">` +
    `“${esc(text)}”${credit}</td></tr></table></td></tr>`
  );
}

const card = (inner: string) =>
  `<tr><td style="padding:0 0 20px;">` +
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SURFACE};border-radius:24px;">` +
  `${inner}</table></td></tr>`;

const pill = (label: string, href: string) =>
  `<tr><td style="padding:8px 8px 28px;" align="center">` +
  `<a href="${esc(href)}" style="display:inline-block;min-width:220px;background:${ACCENT};color:${SURFACE};text-decoration:none;font-size:15px;font-weight:600;line-height:50px;border-radius:999px;padding:0 28px;">` +
  `${esc(label)}</a></td></tr>`;

function digestIntro(input: { kicker: string; rangeLabel: string; name: string }): string {
  const who = input.name.trim();
  let title: string;
  if (input.kicker.toUpperCase().includes('MONTH')) {
    const month = input.rangeLabel.trim() ? (input.rangeLabel.trim().split(/\s+/)[0] ?? 'the month') : 'the month';
    title = who ? `Here's ${month}, ${who}.` : `Here's ${month}.`;
  } else {
    title = who ? `Here's last week, ${who}.` : "Here's last week.";
  }
  return hero(title) + body(`${input.rangeLabel}. Spent, earned, and where it went.`);
}

function postcard(input: { kicker: string; title: string; body: string; imageUrl: string; alt: string }): string {
  const img =
    `<tr><td style="background:${PAPER};padding:16px 16px 0;border-radius:24px 24px 0 0;" align="center">` +
    `<img src="${esc(input.imageUrl)}" alt="${esc(input.alt)}" width="360" style="width:100%;max-width:360px;height:auto;display:block;border:0;"/>` +
    `</td></tr>`;
  const copy =
    `<tr><td style="padding:16px 24px 24px;">` +
    `<div style="font-size:11px;font-weight:600;letter-spacing:0.16em;color:${INK_FAINT};">${esc(input.kicker)}</div>` +
    `<div style="margin-top:8px;font-size:20px;font-weight:600;color:${INK};">${esc(input.title)}</div>` +
    `<div style="margin-top:8px;font-size:15px;line-height:22px;color:${INK_SOFT};">${esc(input.body)}</div>` +
    `</td></tr>`;
  return card(img + copy);
}

const WELCOME_POSTCARDS = [
  {
    kicker: '01 · CAPTURE',
    title: 'Receipts can become expenses.',
    body: 'Snap a bill and Dime reads it for you. You review it before it counts.',
    file: 'slide-1.png',
  },
  {
    kicker: '02 · LOG IT YOUR WAY',
    title: 'Receipt, voice, or type.',
    body: 'Snap a bill, say “two hundred chai,” or enter it. Same ledger, three doors.',
    file: 'slide-2.png',
  },
  {
    kicker: '03 · BUDGETS',
    title: 'Limits with room left.',
    body: 'Monthly, daily, category. The app tells you when you are close — not after you are through.',
    file: 'slide-3.png',
  },
  {
    kicker: '04 · INSIGHTS',
    title: 'Who you paid. What it cost.',
    body: 'Cashflow, payees, compare this month to last. The indigo is for the number. Everything else stays quiet.',
    file: 'slide-4.png',
  },
  {
    kicker: '05 · ASK',
    title: 'How much on food last month?',
    body: 'The agent answers in Dime, with charts when they help. Plain language. Your data.',
    file: 'slide-5.png',
  },
] as const;

export interface WelcomeHtmlInput {
  name: string;
  /** Folder URL the postcard files live in (no trailing slash needed). */
  assetBase: string;
  appLink: string;
  quoteText: string;
  quoteAuthor: string;
}

export function renderWelcomeHtml(input: WelcomeHtmlInput): string {
  const base = input.assetBase.replace(/\/+$/, '');
  const cards = WELCOME_POSTCARDS.map((item) =>
    postcard({ kicker: item.kicker, title: item.title, body: item.body, imageUrl: `${base}/${item.file}`, alt: item.title }),
  ).join('');
  const inner =
    wordmark() +
    kicker('WELCOME') +
    hero(`You're in, ${input.name}.`) +
    body(
      'Dime is a ledger for the rupees that usually disappear between GPay and “I’ll log it later.” ' +
        'You already have the account. This is what it is for.',
    ) +
    quote(input.quoteText, input.quoteAuthor) +
    cards +
    pill('Open Dime', input.appLink);
  return wrap(inner);
}

function row(
  name: string,
  amount: string,
  barPct: number,
  last: boolean,
  opts: { tone?: string; nameHtml?: string } = {},
): string {
  const tone = opts.tone ?? ACCENT;
  const pct = Math.max(0, Math.min(1, barPct));
  const width = roundHalfEven(pct * 100);
  const border = last ? '' : `border-bottom:1px solid ${LINE};`;
  const label = opts.nameHtml ?? esc(name);
  return (
    `<tr><td style="padding:14px 24px;${border}">` +
    `<table role="presentation" width="100%"><tr>` +
    `<td style="font-size:15px;color:${INK};">${label}</td>` +
    `<td align="right" style="font-size:15px;font-weight:600;color:${tone};">${esc(amount)}</td>` +
    `</tr></table>` +
    `<div style="margin-top:8px;height:6px;background:${SUNKEN};border-radius:999px;">` +
    `<div style="height:6px;width:${width}%;background:${tone};border-radius:999px;"></div>` +
    `</div></td></tr>`
  );
}

const customPill = () =>
  `<span style="display:inline-block;margin-left:8px;border:1px solid ${LINE};border-radius:6px;padding:2px 6px;font-size:10px;line-height:12px;color:${INK_SOFT};vertical-align:middle;">Custom</span>`;

const emptyBlock = (headline: string, subtext: string) =>
  `<tr><td style="padding:20px 24px;">` +
  `<div style="font-size:16px;font-weight:600;color:${INK};">${esc(headline)}</div>` +
  `<div style="margin-top:6px;font-size:14px;color:${INK_SOFT};">${esc(subtext)}</div>` +
  `</td></tr>`;

const sectionHeading = (text: string) =>
  `<tr><td style="padding:20px 24px 8px;font-size:11px;letter-spacing:0.16em;color:${INK_FAINT};">${esc(text)}</td></tr>`;

/** `[name, amount, bar fraction]` */
export type RankedRow = readonly [name: string, amount: string, barPct: number];
/** `[name, amount, bar fraction, is_custom]` */
export type CategoryRow = readonly [name: string, amount: string, barPct: number, isCustom: boolean];
/** `[name, date label, amount]` */
export type ExpenseRow = readonly [name: string, dateLabel: string, amount: string];

function rankedCard(
  title: string,
  rows: readonly RankedRow[],
  opts: { emptyHeadline: string; emptySubtext: string; tone?: string },
): string {
  const heading = sectionHeading(title);
  if (rows.length === 0) return card(heading + emptyBlock(opts.emptyHeadline, opts.emptySubtext));
  const rowOpts = opts.tone ? { tone: opts.tone } : {};
  return card(heading + rows.map(([name, amt, pct], i) => row(name, formatInr(amt), pct, i === rows.length - 1, rowOpts)).join(''));
}

function categoryCard(rows: readonly CategoryRow[]): string {
  const heading = sectionHeading('CATEGORIES');
  if (rows.length === 0) {
    return card(heading + emptyBlock('No spending yet', 'Categories will show up here once you log an expense.'));
  }
  return card(
    heading +
      rows
        .map(([name, amt, pct, isCustom], i) =>
          row(name, formatInr(amt), pct, i === rows.length - 1, { nameHtml: esc(name) + (isCustom ? customPill() : '') }),
        )
        .join(''),
  );
}

function expenseRow(name: string, dateLabel: string, amount: string, last: boolean): string {
  const border = last ? '' : `border-bottom:1px solid ${LINE};`;
  const dateHtml = dateLabel ? `<div style="margin-top:4px;font-size:12px;color:${INK_SOFT};">${esc(dateLabel)}</div>` : '';
  return (
    `<tr><td style="padding:14px 24px;${border}">` +
    `<table role="presentation" width="100%"><tr>` +
    `<td style="font-size:15px;color:${INK};">${esc(name)}${dateHtml}</td>` +
    `<td align="right" style="font-size:15px;font-weight:600;color:${ACCENT};vertical-align:top;">${esc(formatInr(amount))}</td>` +
    `</tr></table></td></tr>`
  );
}

function topExpensesCard(rows: readonly ExpenseRow[]): string {
  const heading = sectionHeading('TOP EXPENSES');
  if (rows.length === 0) return card(heading + emptyBlock('No expenses yet', 'Your largest debits will appear here.'));
  return card(heading + rows.map(([name, dateLabel, amt], i) => expenseRow(name, dateLabel, amt, i === rows.length - 1)).join(''));
}

const parseAmount = (raw: string): number => {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
};

function metricColor(raw: string, kind: 'income' | 'spent' | 'net'): string {
  const value = parseAmount(raw);
  if (Math.abs(value) < 0.005) return INK;
  if (kind === 'income') return SUCCESS;
  if (kind === 'spent') return DANGER;
  return value > 0 ? SUCCESS : DANGER;
}

function metricCell(label: string, raw: string, kind: 'income' | 'spent' | 'net', borderLeft: boolean): string {
  const border = borderLeft ? `border-left:1px solid ${LINE};` : '';
  return (
    `<td width="33%" align="center" style="padding:16px 8px;${border}">` +
    `<div style="font-size:10px;font-weight:500;letter-spacing:0.6px;color:${INK_FAINT};">${esc(label)}</div>` +
    `<div style="margin-top:4px;font-size:16px;font-weight:600;color:${metricColor(raw, kind)};">${esc(formatInr(raw))}</div></td>`
  );
}

function metricsCard(input: { income: string; spent: string; net: string }): string {
  return card(
    `<tr><td style="padding:4px 8px;">` +
      `<table role="presentation" width="100%"><tr>` +
      metricCell('Income', input.income, 'income', false) +
      metricCell('Spent', input.spent, 'spent', true) +
      metricCell('Net', input.net, 'net', true) +
      `</tr></table></td></tr>`,
  );
}

function summaryCard(input: { kicker: string; rangeLabel: string; spent: string; budgetLine: string; budgetPct: number | null }): string {
  const header =
    `<tr><td style="padding:20px 24px 0;">` +
    `<table role="presentation" width="100%"><tr>` +
    `<td style="font-size:11px;font-weight:600;letter-spacing:0.16em;color:${INK_FAINT};">${esc(input.kicker)}</td>` +
    `<td align="right" style="font-size:13px;color:${INK_SOFT};">${esc(input.rangeLabel)}</td>` +
    `</tr></table></td></tr>`;
  let status: string;
  let bar = '';
  if (input.budgetPct !== null) {
    const clamped = Math.max(0, Math.min(1, input.budgetPct));
    const used = roundHalfEven(clamped * 100);
    status = `${esc(input.budgetLine)}<span style="color:${INK_FAINT};"> · ${used}% used</span>`;
    bar =
      `<div style="margin-top:12px;height:5px;background:${SUNKEN};border-radius:999px;">` +
      `<div style="height:5px;width:${used}%;background:${ACCENT};border-radius:999px;"></div>` +
      `</div>`;
  } else {
    status = esc('No budget set');
  }
  const heroRow =
    `<tr><td style="padding:16px 24px 20px;">` +
    `<div style="font-size:40px;line-height:48px;font-weight:700;letter-spacing:-0.02em;color:${ACCENT};">${esc(formatInr(input.spent))}</div>` +
    `<div style="margin-top:8px;font-size:13px;line-height:18px;color:${INK_SOFT};">${status}</div>${bar}</td></tr>`;
  return card(header + heroRow);
}

export interface DigestHtmlInput {
  kicker: string;
  rangeLabel: string;
  spent: string;
  income: string;
  net: string;
  payees: readonly RankedRow[];
  incomeSources: readonly RankedRow[];
  categories: readonly CategoryRow[];
  topExpenses: readonly ExpenseRow[];
  budgetLine: string;
  budgetPct: number | null;
  appLink: string;
  quoteText: string;
  quoteAuthor: string;
  name?: string;
}

export function renderDigestHtml(input: DigestHtmlInput): string {
  const inner =
    wordmark() +
    digestIntro({ kicker: input.kicker, rangeLabel: input.rangeLabel, name: input.name ?? '' }) +
    quote(input.quoteText, input.quoteAuthor) +
    summaryCard({
      kicker: input.kicker,
      rangeLabel: input.rangeLabel,
      spent: input.spent,
      budgetLine: input.budgetLine,
      budgetPct: input.budgetPct,
    }) +
    metricsCard({ income: input.income, spent: input.spent, net: input.net }) +
    categoryCard(input.categories) +
    rankedCard('WHO YOU PAID', input.payees, {
      emptyHeadline: 'No payee data yet',
      emptySubtext: 'See where your money went once you log expenses.',
    }) +
    rankedCard('WHO PAID YOU', input.incomeSources, {
      emptyHeadline: 'No income recorded',
      emptySubtext: 'Income sources will show up when credits are logged.',
      tone: SUCCESS,
    }) +
    topExpensesCard(input.topExpenses) +
    pill('Open Insights', input.appLink);
  return wrap(inner);
}

export function renderUnsubscribedHtml(kind: string): string {
  const label = kind === 'weekly' ? 'weekly' : 'monthly';
  const inner =
    wordmark() +
    kicker('EMAIL SUMMARIES') +
    hero(`${label.charAt(0).toUpperCase()}${label.slice(1)} letters are off.`) +
    body('You can turn them back on in Dime under Settings → Email summaries.');
  return wrap(inner);
}
