import { describe, expect, it } from 'vitest';

import { hmacSha256Hex, safeEqual } from '../src/core/crypto';
import { BrevoClient, PermanentEmailError, parseFromAddress } from '../src/features/email/brevo';
import {
  escapeHtml,
  formatInr,
  renderDigestHtml,
  renderUnsubscribedHtml,
  renderWelcomeHtml,
  roundHalfEven,
} from '../src/features/email/html';
import {
  digestPeriodFromKey,
  digestPeriodNow,
  dueDigestKinds,
  isoWeekOf,
  mondayOfIsoWeek,
  previousMonthPeriod,
  previousWeekPeriod,
} from '../src/features/email/periods';
import {
  FALLBACK_QUOTES,
  createQuoteSource,
  fetchMoneyQuotes,
  parseFavqsQuotes,
  pickQuote,
} from '../src/features/email/quotes';
import {
  UnsubscribeSecretError,
  signUnsubscribeToken,
  unsubscribeUrl,
  verifyUnsubscribeToken,
} from '../src/features/email/tokens';
import { UpstreamError } from '../src/core/errors';
import { json, useSupabaseStub } from './supabase-stub';

const stub = useSupabaseStub();
const at = (iso: string) => Date.parse(iso);

describe('unsubscribe tokens: compatibility with the Python implementation', () => {
  // Generated with `cd backend && uv run python -c "from features.email.tokens import sign_unsubscribe_token ..."`.
  const VECTORS = [
    {
      secret: 's',
      userId: 'user-1',
      kind: 'weekly' as const,
      ts: 1_700_000_000,
      token: 'user-1|weekly|1700000000|fd0bc2dee5f8ada96fcb476a609d950058d3b1af23c38d077c88359929427eb9',
    },
    {
      secret: 'test-secret-123',
      userId: '11111111-1111-1111-1111-111111111111',
      kind: 'monthly' as const,
      ts: 1_790_000_000,
      token: '11111111-1111-1111-1111-111111111111|monthly|1790000000|5d4e775fc347eac660dc40e1eff4adf666a23c8735d87a2ceeaedf3ed8813757',
    },
    {
      secret: 'p@ss|w0rd ünï',
      userId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      kind: 'weekly' as const,
      ts: 1_800_000_000,
      token: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee|weekly|1800000000|b4f4874aaa4f051e29d6077318612b094a55db9bd416f22078d2248fa74d8f7d',
    },
  ];

  it.each(VECTORS)('signs exactly like Python ($userId, $kind)', async ({ secret, userId, kind, ts, token }) => {
    expect(await signUnsubscribeToken({ secret, userId, kind, nowTs: ts })).toBe(token);
  });

  it.each(VECTORS)('verifies tokens issued by Python ($userId)', async ({ secret, userId, kind, ts, token }) => {
    expect(await verifyUnsubscribeToken({ secret, token, nowTs: ts + 60 })).toEqual({ userId, kind });
  });

  it('roundtrips and rejects a wrong secret, tampering and malformed tokens', async () => {
    const token = await signUnsubscribeToken({ secret: 's', userId: 'user-1', kind: 'weekly', nowTs: 1_700_000_000 });
    expect(await verifyUnsubscribeToken({ secret: 's', token, nowTs: 1_700_000_060 })).toEqual({ userId: 'user-1', kind: 'weekly' });
    expect(await verifyUnsubscribeToken({ secret: 'other', token, nowTs: 1_700_000_000 })).toBeNull();
    expect(await verifyUnsubscribeToken({ secret: 's', token: token.replace('weekly', 'monthly'), nowTs: 1_700_000_000 })).toBeNull();
    expect(await verifyUnsubscribeToken({ secret: 's', token: token.replace('user-1', 'user-2'), nowTs: 1_700_000_000 })).toBeNull();
    for (const bad of ['', 'a|b|c', 'u|weekly|x|abc', 'u|daily|1|abc', 'u|weekly|1|abc|d']) {
      expect(await verifyUnsubscribeToken({ secret: 's', token: bad, nowTs: 1_700_000_000 }), bad).toBeNull();
    }
  });

  it('expires after 90 days and rejects tokens from the future', async () => {
    const token = await signUnsubscribeToken({ secret: 's', userId: 'u', kind: 'weekly', nowTs: 1_700_000_000 });
    const day = 24 * 60 * 60;
    expect(await verifyUnsubscribeToken({ secret: 's', token, nowTs: 1_700_000_000 + 90 * day })).not.toBeNull();
    expect(await verifyUnsubscribeToken({ secret: 's', token, nowTs: 1_700_000_000 + 90 * day + 1 })).toBeNull();
    expect(await verifyUnsubscribeToken({ secret: 's', token, nowTs: 1_700_000_000 - 61 })).toBeNull();
    expect(await verifyUnsubscribeToken({ secret: 's', token, nowTs: 1_700_000_000 - 59 })).not.toBeNull();
  });

  it.each([undefined, null, '', '   '])('requires a secret: %j (S3, no hardcoded fallback)', async (secret) => {
    await expect(signUnsubscribeToken({ secret, userId: 'u1', kind: 'weekly' })).rejects.toBeInstanceOf(UnsubscribeSecretError);
    await expect(verifyUnsubscribeToken({ secret, token: 'u1|weekly|1|abc' })).rejects.toBeInstanceOf(UnsubscribeSecretError);
  });

  it('rejects tokens signed with the legacy hardcoded secret', async () => {
    const legacy = await signUnsubscribeToken({ secret: 'dev-unsub-secret', userId: 'u1', kind: 'weekly' });
    expect(await verifyUnsubscribeToken({ secret: 'real-secret', token: legacy })).toBeNull();
  });

  it('builds the same URL as Python (path under /api/v1, form-encoded token)', () => {
    expect(unsubscribeUrl({ publicBase: 'https://api.example.com/', token: 'u|weekly|1|abc' })).toBe(
      'https://api.example.com/api/v1/email/unsubscribe?token=u%7Cweekly%7C1%7Cabc',
    );
  });
});

describe('crypto helpers', () => {
  it('safeEqual compares secrets of any length', async () => {
    expect(await safeEqual('abc', 'abc')).toBe(true);
    expect(await safeEqual('abc', 'abd')).toBe(false);
    expect(await safeEqual('abc', 'abcd')).toBe(false);
    expect(await safeEqual('', '')).toBe(true);
    expect(await safeEqual('ü', 'ü')).toBe(true);
  });

  it('hmac matches a known vector', async () => {
    // RFC 4231 test case 2
    expect(await hmacSha256Hex('Jefe', 'what do ya want for nothing?')).toBe('5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
  });
});

describe('digest periods (IST)', () => {
  it('previous week is the last complete Mon-Sun (Python test + ISO year boundaries)', () => {
    const w = previousWeekPeriod(at('2026-08-17T08:00:00+05:30'));
    expect(w.periodKey).toBe('2026-W33');
    expect(w.range).toEqual({ from: '2026-08-09T18:30:00.000Z', to: '2026-08-16T18:30:00.000Z' }); // 10 Aug 00:00 IST .. 17 Aug 00:00 IST
    expect(w.rangeLabel).toBe('10 Aug – 16 Aug 2026');
    expect(w.kicker).toBe('THIS WEEK');
    expect(w.subject).toBe('Your week in Dime');
    expect([w.budgetYear, w.budgetMonth]).toEqual([2026, 8]);

    // From Python: previous_week_bounds_iso(...)
    expect(previousWeekPeriod(at('2026-01-05T08:00:00+05:30')).periodKey).toBe('2026-W01'); // 2025-12-29 .. 2026-01-04
    expect(previousWeekPeriod(at('2025-01-06T08:00:00+05:30')).periodKey).toBe('2025-W01'); // 2024-12-30 .. 2025-01-05
    expect(previousWeekPeriod(at('2026-12-28T08:00:00+05:30')).periodKey).toBe('2026-W52'); // 2026-12-21 .. 2026-12-27
    const wk = previousWeekPeriod(at('2026-01-05T08:00:00+05:30'));
    expect(wk.rangeLabel).toBe('29 Dec – 04 Jan 2026');
    expect([wk.budgetYear, wk.budgetMonth]).toEqual([2026, 1]); // the month containing the week's last day
  });

  it('previous month period and key', () => {
    const m = previousMonthPeriod(at('2026-09-01T08:00:00+05:30'));
    expect(m.periodKey).toBe('2026-08');
    expect(m.rangeLabel).toBe('August 2026');
    expect(m.subject).toBe('Your August in Dime');
    expect(m.kicker).toBe('THIS MONTH');
    expect(m.range).toEqual({ from: '2026-07-31T18:30:00.000Z', to: '2026-08-31T18:30:00.000Z' });
    expect(previousMonthPeriod(at('2026-01-01T08:00:00+05:30')).periodKey).toBe('2025-12');
  });

  it('rebuilds a period from its key (what the queue consumer does)', () => {
    for (const nowMs of [at('2026-08-17T08:00:00+05:30'), at('2026-01-05T08:00:00+05:30'), at('2026-12-28T08:00:00+05:30'), at('2027-01-04T08:00:00+05:30')]) {
      const original = previousWeekPeriod(nowMs);
      expect(digestPeriodFromKey('weekly', original.periodKey)).toEqual(original);
    }
    for (const nowMs of [at('2026-09-01T08:00:00+05:30'), at('2026-01-01T08:00:00+05:30')]) {
      const original = previousMonthPeriod(nowMs);
      expect(digestPeriodFromKey('monthly', original.periodKey)).toEqual(original);
    }
    expect(digestPeriodNow('weekly', at('2026-08-19T12:00:00+05:30')).periodKey).toBe('2026-W33'); // mid-week reruns hit the same key
  });

  it('rejects malformed keys', () => {
    for (const [kind, key] of [['weekly', '2026-08'], ['weekly', '2026-W00'], ['weekly', '2026-W54'], ['monthly', '2026-W33'], ['monthly', '2026-13'], ['monthly', '2026-8'], ['weekly', '']] as const) {
      expect(digestPeriodFromKey(kind, key), `${kind} ${key}`).toBeNull();
    }
  });

  it('ISO week arithmetic', () => {
    expect(isoWeekOf({ year: 2021, month: 1, day: 3 })).toEqual({ isoYear: 2020, isoWeek: 53 });
    expect(isoWeekOf({ year: 2024, month: 12, day: 30 })).toEqual({ isoYear: 2025, isoWeek: 1 });
    expect(mondayOfIsoWeek(2020, 53)).toEqual({ year: 2020, month: 12, day: 28 });
    expect(mondayOfIsoWeek(2026, 1)).toEqual({ year: 2025, month: 12, day: 29 });
  });

  it('due kinds at the 08:00 IST cron (02:30 UTC): Monday weekly, 1st monthly, both when they coincide', () => {
    expect(dueDigestKinds(at('2026-08-17T02:30:00Z'))).toEqual(['weekly']); // Monday
    expect(dueDigestKinds(at('2026-08-18T02:30:00Z'))).toEqual([]); // Tuesday
    expect(dueDigestKinds(at('2026-09-01T02:30:00Z'))).toEqual(['monthly']); // Tuesday the 1st
    expect(dueDigestKinds(at('2026-06-01T02:30:00Z'))).toEqual(['weekly', 'monthly']); // Monday the 1st
    expect(dueDigestKinds(at('2027-02-01T02:30:00Z'))).toEqual(['weekly', 'monthly']);
    expect(dueDigestKinds(at('2026-08-16T02:30:00Z'))).toEqual([]); // Sunday
  });

  it('the day is the IST day, not the UTC day', () => {
    // 18:45 UTC on Sunday is already Monday 00:15 IST.
    expect(dueDigestKinds(at('2026-08-16T18:45:00Z'))).toEqual(['weekly']);
    // 18:45 UTC on Monday is Tuesday in IST.
    expect(dueDigestKinds(at('2026-08-17T18:45:00Z'))).toEqual([]);
    // Last day of the month in UTC evening is the 1st in IST.
    expect(dueDigestKinds(at('2026-08-31T18:45:00Z'))).toEqual(['monthly']);
  });
});

describe('format helpers', () => {
  it('format_inr matches Python', () => {
    expect(['12430', '0', '-5', '1234567.5', '999.999', '0.004', 'abc', '1000000', '12.345'].map(formatInr)).toEqual([
      '₹12,430',
      '₹0',
      '-₹5',
      '₹1,234,567.50',
      '₹1,000',
      '₹0',
      '₹0',
      '₹1,000,000',
      '₹12.35',
    ]);
    expect(formatInr(12430)).toBe('₹12,430');
  });

  it('escapes like Python html.escape and rounds ties to even', () => {
    expect(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;Tom &amp; &#x27;Jerry&#x27;&lt;/a&gt;');
    expect([0.5, 1.5, 2.5, 40.5, 41.5, 0.4, 0.6, -0.5].map(roundHalfEven)).toEqual([0, 2, 2, 40, 42, 0, 1, -0]);
  });
});

describe('email HTML (port of test_email_core.py)', () => {
  const base = {
    quoteText: 'Keep rupees close.',
    quoteAuthor: 'Ada',
    appLink: 'https://example.com',
    name: 'Amrith',
  };

  it('welcome carries the tour copy, the postcards and one quote', () => {
    const html = renderWelcomeHtml({ ...base, assetBase: 'http://localhost:8000/email/' });
    expect(html).toContain('Amrith');
    expect(html).toContain('01 · CAPTURE');
    expect(html).toContain('http://localhost:8000/email/slide-1.png');
    expect(html).toContain('http://localhost:8000/email/slide-5.png');
    expect(html).not.toContain('//slide-');
    expect(html).toContain('#2B3FE0');
    expect(html.split('Keep rupees close.')).toHaveLength(2);
    expect(html).toContain('Ada');
    expect(html).not.toContain('Henry David Thoreau');
    expect(html.indexOf('Keep rupees close.')).toBeLessThan(html.indexOf('01 · CAPTURE'));
    expect(html).toContain('You&#x27;re in, Amrith.');
    expect(html).toContain('Open Dime');
    expect(html).toContain('<!DOCTYPE html>');
  });

  it('empty weekly digest defaults', () => {
    const html = renderDigestHtml({
      ...base,
      kicker: 'THIS WEEK',
      rangeLabel: '10–16 Aug',
      spent: '0',
      income: '0',
      net: '0',
      payees: [],
      incomeSources: [],
      categories: [],
      topExpenses: [],
      budgetLine: 'No budget set',
      budgetPct: null,
    });
    for (const text of [
      'THIS WEEK',
      'Here&#x27;s last week, Amrith.',
      'Keep rupees close.',
      'Spent, earned, and where it went',
      '10–16 Aug',
      '₹0',
      'No budget set',
      'Income',
      'Spent',
      'Net',
      'CATEGORIES',
      'No spending yet',
      'WHO YOU PAID',
      'WHO PAID YOU',
      'No income recorded',
      'TOP EXPENSES',
      'No expenses yet',
      'Open Insights',
    ]) {
      expect(html, text).toContain(text);
    }
    expect(html.indexOf('last week, Amrith')).toBeLessThan(html.indexOf('Keep rupees close.'));
    expect(html.indexOf('Keep rupees close.')).toBeLessThan(html.indexOf('THIS WEEK'));
    for (const text of ['John C. Maxwell', 'Charles Dickens', 'TOP CATEGORIES', 'CASHFLOW', 'Turn off weekly']) expect(html).not.toContain(text);
  });

  it('filled digest cards', () => {
    const html = renderDigestHtml({
      ...base,
      kicker: 'THIS WEEK',
      rangeLabel: '10–16 Aug',
      spent: '500',
      income: '2000',
      net: '1500',
      payees: [['Metro', '200', 1]],
      incomeSources: [['Salary', '2000', 1]],
      categories: [
        ['Food', '300', 1, false],
        ['Rent', '200', 0.67, true],
      ],
      topExpenses: [['Metro', '12 Aug', '200']],
      budgetLine: '₹8,200 / ₹20,000',
      budgetPct: 0.41,
    });
    for (const text of ['₹500', '#2B3FE0', '₹2,000', 'Salary', 'Food', 'Rent', 'Custom', '12 Aug', '41% used', 'width:67%', 'width:100%', '₹8,200 / ₹20,000']) {
      expect(html, text).toContain(text);
    }
    expect(html).not.toContain('75% saved');
    // spent is red, income and positive net green
    expect(html).toContain('color:#D6394A;">₹500');
    expect(html).toContain('color:#1A8754;">₹2,000');
  });

  it('monthly intro and escaping of user-controlled text', () => {
    const html = renderDigestHtml({
      ...base,
      name: '<b>Eve</b>',
      kicker: 'THIS MONTH',
      rangeLabel: 'August 2026',
      spent: '0',
      income: '0',
      net: '0',
      payees: [['<script>alert(1)</script>', '5', 1]],
      incomeSources: [],
      categories: [['A & B', '5', 1, false]],
      topExpenses: [],
      budgetLine: 'No budget set',
      budgetPct: null,
    });
    expect(html).toContain('Here&#x27;s August, &lt;b&gt;Eve&lt;/b&gt;.');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('A &amp; B');
  });

  it('unsubscribed page', () => {
    expect(renderUnsubscribedHtml('weekly')).toContain('Weekly letters are off.');
    expect(renderUnsubscribedHtml('monthly')).toContain('Monthly letters are off.');
    expect(renderUnsubscribedHtml('monthly')).toContain('Settings → Email summaries.');
  });
});

describe('quotes (port of test_email_quotes.py)', () => {
  it('keeps short money rows with an author', () => {
    expect(
      parseFavqsQuotes({
        quotes: [
          { body: 'Saving is another form of earning.', author: 'Benjamin Franklin' },
          { body: '', author: 'Nobody' },
          { body: 'A'.repeat(181), author: 'Long' },
          { body: 'Keep it.', author: '  ' },
          { body: 'Wealth is what you accumulate.', author: 'The Millionaire Next Door' },
          'junk',
          { body: 3, author: 'x' },
        ],
      }),
    ).toEqual([
      ['Saving is another form of earning.', 'Benjamin Franklin'],
      ['Wealth is what you accumulate.', 'The Millionaire Next Door'],
    ]);
    expect(parseFavqsQuotes(null)).toEqual([]);
    expect(parseFavqsQuotes({ quotes: 'x' })).toEqual([]);
  });

  it('picks from the pool, falling back when it is empty', () => {
    const pool = [['one', 'A'], ['two', 'B']] as const;
    expect(pickQuote(pool, () => 0)).toEqual(['one', 'A']);
    expect(pickQuote(pool, () => 0.99)).toEqual(['two', 'B']);
    expect(FALLBACK_QUOTES).toContainEqual(pickQuote([], () => 0.5));
  });

  it('no key: fallback pool and no request', async () => {
    expect(await fetchMoneyQuotes(undefined)).toEqual([...FALLBACK_QUOTES]);
    expect(await fetchMoneyQuotes('  ')).toEqual([...FALLBACK_QUOTES]);
    expect(stub.calls).toHaveLength(0);
  });

  it('parses a FavQs page (request shape: tag filter, token auth)', async () => {
    stub.on('GET', '/api/quotes', () => json({ quotes: [{ body: 'Keep it.', author: 'Ada' }] }));
    expect(await fetchMoneyQuotes('secret')).toEqual([['Keep it.', 'Ada']]);
    const call = stub.last('GET', '/api/quotes');
    expect(call.url.host).toBe('favqs.com');
    expect(call.params.get('filter')).toBe('money');
    expect(call.params.get('type')).toBe('tag');
    expect(call.headers.get('authorization')).toBe('Token token="secret"');
  });

  it('an empty page, an HTTP error or a network failure falls back', async () => {
    stub.on('GET', '/api/quotes', () => json({ quotes: [] }), { once: true });
    expect(await fetchMoneyQuotes('secret')).toEqual([...FALLBACK_QUOTES]);
    stub.on('GET', '/api/quotes', () => json({}, { status: 500 }), { once: true });
    expect(await fetchMoneyQuotes('secret')).toEqual([...FALLBACK_QUOTES]);
    stub.on('GET', '/api/quotes', () => Promise.reject(new TypeError('fetch failed')), { once: true });
    expect(await fetchMoneyQuotes('secret')).toEqual([...FALLBACK_QUOTES]);
    expect(stub.find('GET', '/api/quotes')).toHaveLength(3); // retries disabled: one attempt each
  });

  it('a quote source fetches once and picks per call', async () => {
    stub.on('GET', '/api/quotes', () => json({ quotes: [{ body: 'Keep it.', author: 'Ada' }, { body: 'Spend less.', author: 'Ben' }] }));
    let i = 0;
    const next = createQuoteSource('secret', () => (i++ % 2 === 0 ? 0 : 0.99));
    expect(await next()).toEqual(['Keep it.', 'Ada']);
    expect(await next()).toEqual(['Spend less.', 'Ben']);
    expect(stub.find('GET', '/api/quotes')).toHaveLength(1);
  });
});

describe('Brevo client', () => {
  it('parses the from address', () => {
    expect(parseFromAddress('Dime <hello@x.com>')).toEqual(['Dime', 'hello@x.com']);
    expect(parseFromAddress('hello@x.com')).toEqual(['Dime', 'hello@x.com']);
    expect(parseFromAddress('"Dime Team" <hello@x.com>')).toEqual(['Dime Team', 'hello@x.com']);
  });

  it('is a no-op without a key', async () => {
    const client = new BrevoClient(undefined, 'Dime <hello@example.com>');
    expect(client.enabled).toBe(false);
    expect(await client.sendHtml({ toEmail: 'a@b.com', toName: 'A', subject: 'Hi', html: '<p>x</p>' })).toBeNull();
    expect(stub.calls).toHaveLength(0);
  });

  it('posts the transactional payload and returns the message id', async () => {
    stub.on('POST', '/v3/smtp/email', () => json({ messageId: '<abc@smtp>' }, { status: 201 }));
    const client = new BrevoClient(' key-1 ', 'Dime <hello@example.com>');
    expect(client.enabled).toBe(true);
    const id = await client.sendHtml({ toEmail: 'a@b.com', toName: 'Ann', subject: 'Hi', html: '<p>x</p>', listUnsubscribeUrl: 'https://u/x' });
    expect(id).toBe('<abc@smtp>');
    const call = stub.last('POST', '/v3/smtp/email');
    expect(call.url.host).toBe('api.brevo.com');
    expect(call.headers.get('api-key')).toBe('key-1');
    expect(call.body).toEqual({
      sender: { name: 'Dime', email: 'hello@example.com' },
      to: [{ email: 'a@b.com', name: 'Ann' }],
      subject: 'Hi',
      htmlContent: '<p>x</p>',
      headers: { 'List-Unsubscribe': '<https://u/x>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    });
  });

  it('omits name and headers when absent; "ok" when Brevo returns no id', async () => {
    stub.on('POST', '/v3/smtp/email', () => json({}, { status: 202 }));
    const id = await new BrevoClient('k', 'hello@example.com').sendHtml({ toEmail: 'a@b.com', subject: 'Hi', html: 'x' });
    expect(id).toBe('ok');
    const body = stub.last('POST', '/v3/smtp/email').body as Record<string, unknown>;
    expect(body['to']).toEqual([{ email: 'a@b.com' }]);
    expect(body).not.toHaveProperty('headers');
  });

  it.each([429, 500, 503])('a %s is transient (UpstreamError) and never retried inside the client', async (status) => {
    stub.on('POST', '/v3/smtp/email', () => json({ message: 'nope' }, { status }));
    await expect(new BrevoClient('k', 'h@x.com').sendHtml({ toEmail: 'a@b.com', subject: 's', html: 'x' })).rejects.toBeInstanceOf(UpstreamError);
    expect(stub.find('POST', '/v3/smtp/email')).toHaveLength(1);
  });

  it.each([400, 401, 403])('a %s is permanent', async (status) => {
    stub.on('POST', '/v3/smtp/email', () => json({ message: 'nope' }, { status }));
    await expect(new BrevoClient('k', 'h@x.com').sendHtml({ toEmail: 'a@b.com', subject: 's', html: 'x' })).rejects.toBeInstanceOf(PermanentEmailError);
  });

  it('a network failure is transient', async () => {
    stub.on('POST', '/v3/smtp/email', () => Promise.reject(new TypeError('fetch failed')));
    await expect(new BrevoClient('k', 'h@x.com').sendHtml({ toEmail: 'a@b.com', subject: 's', html: 'x' })).rejects.toBeInstanceOf(UpstreamError);
  });
});
