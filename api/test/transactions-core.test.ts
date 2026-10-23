import { describe, expect, it } from 'vitest';

import { formatCents, quantizeMoney, toCents } from '../src/core/decimal';
import { BadRequestError, ValidationError } from '../src/core/errors';
import { addDays, dayRange, lastNDaysRange, localDate, monthRange, parseTimezone, startOfLocalDay } from '../src/core/timezone';
import { parseIdempotencyKey } from '../src/features/jobs/idempotency';
import { detectAudioFormat } from '../src/features/media/audio-format';
import { buildObjectPath } from '../src/features/media/paths';
import { storedMediaKey } from '../src/features/media/refs';
import { detectReceiptImageFormat } from '../src/core/image-format';
import {
  buildDaySummaries,
  dailyCashflowSeries,
  dailyDebitSeries,
  dayTotalsFromRows,
  debitByCategoryResponse,
  fixedFlexibleFields,
  sumDayTotals,
} from '../src/features/transactions/aggregates';
import {
  buildPaymentHash,
  buildSparseMergePatch,
  formatAmountForHash,
  normalizeCounterparty,
  payeeKey,
  transactionMinuteBucket,
} from '../src/features/transactions/dedupe';
import { parseDatetime, transactionWriteSchema } from '../src/features/transactions/schemas';
import { payeeLikePatterns } from '../src/features/transactions/repository';
import type { PayeeRow } from '../src/features/transactions/repository';
import { rollUpIncome, rollUpSpend, share } from '../src/features/insights/rollup';
import { formatInr, bodyForAutoTx, titleForAutoTx } from '../src/features/notifications/emitter';
import { crossedThresholds } from '../src/features/notifications/budget-evaluator';

const iso = (ms: number) => new Date(ms).toISOString();

describe('timezone helpers (expected values computed with Python zoneinfo)', () => {
  it.each([
    ['America/Sao_Paulo', { year: 2018, month: 11, day: 4 }, '2018-11-04T03:00:00.000Z'], // midnight skipped by DST
    ['America/New_York', { year: 2026, month: 3, day: 1 }, '2026-03-01T05:00:00.000Z'],
    ['America/New_York', { year: 2026, month: 4, day: 1 }, '2026-04-01T04:00:00.000Z'],
    ['America/New_York', { year: 2026, month: 11, day: 1 }, '2026-11-01T04:00:00.000Z'],
    ['Asia/Kolkata', { year: 2026, month: 12, day: 1 }, '2026-11-30T18:30:00.000Z'],
    ['Australia/Sydney', { year: 2026, month: 10, day: 5 }, '2026-10-04T13:00:00.000Z'],
    ['Australia/Lord_Howe', { year: 2026, month: 3, day: 29 }, '2026-03-28T13:00:00.000Z'],
    ['Atlantic/Azores', { year: 2026, month: 3, day: 29 }, '2026-03-29T01:00:00.000Z'], // gap at midnight
  ])('startOfLocalDay %s %j', (tz, date, expected) => {
    expect(iso(startOfLocalDay(tz, date))).toBe(expected);
  });

  it('monthRange is half-open and handles December', () => {
    expect(monthRange('Asia/Kolkata', 2026, 12)).toEqual({ from: '2026-11-30T18:30:00.000Z', to: '2026-12-31T18:30:00.000Z' });
    expect(monthRange('UTC', 2026, 2)).toEqual({ from: '2026-02-01T00:00:00.000Z', to: '2026-03-01T00:00:00.000Z' });
    expect(monthRange('America/New_York', 2026, 3)).toEqual({ from: '2026-03-01T05:00:00.000Z', to: '2026-04-01T04:00:00.000Z' });
  });

  it('localDate / dayRange / lastNDaysRange use the local calendar', () => {
    // 2026-10-04T20:00Z is already Oct 5 in Kolkata (01:30) but still Oct 4 in New York.
    const instant = Date.UTC(2026, 9, 4, 20, 0);
    expect(localDate('Asia/Kolkata', instant)).toEqual({ year: 2026, month: 10, day: 5 });
    expect(localDate('America/New_York', instant)).toEqual({ year: 2026, month: 10, day: 4 });
    expect(dayRange('Asia/Kolkata', { year: 2026, month: 10, day: 5 })).toEqual({
      from: '2026-10-04T18:30:00.000Z',
      to: '2026-10-05T18:30:00.000Z',
    });
    expect(lastNDaysRange('UTC', { year: 2026, month: 3, day: 2 }, 7)).toEqual({
      from: '2026-02-24T00:00:00.000Z',
      to: '2026-03-03T00:00:00.000Z',
    });
    expect(addDays({ year: 2026, month: 12, day: 31 }, 1)).toEqual({ year: 2027, month: 1, day: 1 });
  });

  it('parseTimezone rejects unknown zones with a 400 and the Python message', () => {
    expect(parseTimezone(' Asia/Kolkata ')).toBe('Asia/Kolkata');
    expect(() => parseTimezone('Mars/Base')).toThrow(BadRequestError);
    expect(() => parseTimezone('Mars/Base')).toThrow("Invalid timezone: 'Mars/Base'");
    expect(() => parseTimezone('  ')).toThrow('Timezone is required');
  });
});

describe('money helpers', () => {
  it('quantizeMoney rounds half-even like Decimal.quantize', () => {
    expect(quantizeMoney('10.005')).toBe('10.00');
    expect(quantizeMoney('10.015')).toBe('10.02');
    expect(quantizeMoney('10.0151')).toBe('10.02');
    expect(quantizeMoney('0.001')).toBe('0.00');
    expect(quantizeMoney('199')).toBe('199.00');
    expect(quantizeMoney('250.5')).toBe('250.50');
    expect(quantizeMoney('99999999999999.995')).toBe('100000000000000.00');
    expect(quantizeMoney('-1.005')).toBe('-1.00');
  });

  it('cents round trip', () => {
    expect(toCents(1234567.89)).toBe(123456789);
    expect(toCents('19.99')).toBe(1999);
    expect(toCents('x')).toBe(0);
    expect(formatCents(-13500)).toBe('-135.00');
    expect(formatCents(5)).toBe('0.05');
  });
});

// Vectors produced by backend/features/transactions/dedupe.py::build_payment_hash.
describe('payment_hash is byte-identical to Python', () => {
  const at = (...a: [number, number, number, number, number, number?]) => Date.UTC(a[0], a[1] - 1, a[2], a[3], a[4], a[5] ?? 0);
  const vectors: [string, Parameters<typeof buildPaymentHash>[0], string][] = [
    [
      'plain',
      { amount: '480.00', type: 'debit', counterpartyNormalized: 'swiggy', counterpartyName: 'Swiggy', transactionAtMs: at(2026, 6, 18, 14, 30) },
      '797481751b695e61de0a10980708ded4a8072f8b8273d7515f5eb90f6f9964cd',
    ],
    [
      'integer amount, derives counterparty from the name, seconds ignored',
      { amount: '199', type: 'credit', counterpartyNormalized: null, counterpartyName: 'SWIGGY-INDIA', transactionAtMs: at(2026, 6, 18, 14, 30, 45) },
      '3d0543462095a2b78791c4b600e78fbf61eba190994894f17a16a2f775fd505f',
    ],
    [
      'blank normalized falls back to the name; +05:30 instant',
      { amount: '250.5', type: 'debit', counterpartyNormalized: '', counterpartyName: '  Café Coffee Day! ', transactionAtMs: Date.parse('2026-08-02T17:30:00+05:30') },
      'cfb1940afcad6575a2ff53c1a0a67814b2ccdd191a73ecf61256dc9268df35d0',
    ],
    [
      'IST midnight crosses to the previous UTC day',
      { amount: '0.10', type: 'debit', counterpartyNormalized: 'amazon pay', counterpartyName: 'Amazon Pay', transactionAtMs: Date.parse('2026-01-01T00:00:00+05:30') },
      '37318ecc3293e7149fc6aedbd912bfc3e3e7d3a22efd35eb844de42f40cef94c',
    ],
    [
      'large amount',
      { amount: '1234567.89', type: 'credit', counterpartyNormalized: 'ravi kumar', counterpartyName: 'Ravi Kumar', transactionAtMs: at(2026, 12, 31, 23, 59, 59) },
      'b09bd2e125f39da325a264f39dc1e2dfcca5327cb45ccf0a53f80c8229d0a223',
    ],
    [
      'half-even amount rounding (10.005 -> 10.00)',
      { amount: '10.005', type: 'debit', counterpartyNormalized: 'shop', counterpartyName: 'Shop', transactionAtMs: at(2026, 10, 4, 10, 0) },
      'ce6e57dd391a5f07ecda863ea827b6536ece22736fa561136240a29934be7cf2',
    ],
    [
      'non-ASCII normalized value is \\u-escaped like json.dumps(ensure_ascii=True)',
      { amount: '12.34', type: 'debit', counterpartyNormalized: 'café ☃', counterpartyName: 'x', transactionAtMs: at(2026, 3, 5, 7, 9) },
      '4772be8675ee41c3895aea0dc6ab509443ac06cfe28185d0372997d7bdc52571',
    ],
    [
      'DEL is escaped too',
      { amount: '5', type: 'credit', counterpartyNormalized: 'a\u007fb', counterpartyName: 'x', transactionAtMs: at(2026, 3, 5, 7, 9) },
      '0b5be57080903948fcce33899929e1799d949939c038c90d7694a601b58f293d',
    ],
  ];
  it.each(vectors)('%s', async (_name, input, expected) => {
    expect(await buildPaymentHash(input)).toBe(expected);
  });

  it('is stable within a minute and differs across minutes', async () => {
    const base = { amount: '100.00', type: 'debit', counterpartyNormalized: 'cafe', counterpartyName: 'Cafe' };
    const a = await buildPaymentHash({ ...base, transactionAtMs: Date.UTC(2026, 5, 18, 14, 30, 0) });
    const b = await buildPaymentHash({ ...base, transactionAtMs: Date.UTC(2026, 5, 18, 14, 30, 59) });
    const c = await buildPaymentHash({ ...base, transactionAtMs: Date.UTC(2026, 5, 18, 14, 31, 0) });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toHaveLength(64);
  });

  it('helpers match the Python tests', () => {
    expect(formatAmountForHash('199')).toBe('199.00');
    expect(formatAmountForHash(199.5)).toBe('199.50');
    expect(normalizeCounterparty('SWIGGY-INDIA')).toBe('swiggy india');
    expect(normalizeCounterparty('  Café Coffee Day! ')).toBe('caf coffee day');
    expect(normalizeCounterparty('a__b  c')).toBe('a b c');
    expect(transactionMinuteBucket(Date.UTC(2026, 5, 18, 14, 30, 45))).toBe('2026-06-18T14:30');
  });

  it('sparse merge fills only missing fields', () => {
    expect(
      buildSparseMergePatch(
        { category_id: 'cat-1', note: null, receipt_url: null },
        { category_id: 'cat-2', note: 'lunch', receipt_url: 'r.jpg', voice_url: '  ', counterparty_type: null },
      ),
    ).toEqual({ note: 'lunch', receipt_url: 'r.jpg' });
    const row = { category_id: 'a', note: 'b' };
    expect(buildSparseMergePatch(row, row)).toEqual({});
  });
});

describe('datetime parsing', () => {
  it.each([
    ['2026-10-04T10:00:00Z', '2026-10-04T10:00:00.000Z'],
    ['2026-10-04T10:00:00+05:30', '2026-10-04T04:30:00.000Z'],
    ['2026-10-04T10:00:00.123456Z', '2026-10-04T10:00:00.123Z'],
    ['2026-10-04T10:00:00.057Z', '2026-10-04T10:00:00.057Z'],
    ['2026-10-04 10:00:00', '2026-10-04T10:00:00.000Z'], // naive = UTC
    ['2026-10-04 10:00', '2026-10-04T10:00:00.000Z'],
    ['2026-10-04', '2026-10-04T00:00:00.000Z'],
    ['2026-10-04T10:00:00 05:30', '2026-10-04T04:30:00.000Z'], // "+" decoded as a space in a query string
    ['1791108000', '2026-10-04T10:00:00.000Z'],
  ])('%s', (input, expected) => {
    expect(parseDatetime(input)?.iso).toBe(expected);
  });
  it.each(['nope', '2026-13-01', '2026-02-30T10:00:00Z', '2026-10-04T25:00:00Z', ''])('rejects %j', (input) => {
    expect(parseDatetime(input)).toBeNull();
  });
});

describe('transactionWriteSchema', () => {
  const base = { amount: '250.5', type: 'debit', counterparty_name: ' Shop ', transaction_at: '2026-10-04T10:00:00Z' };

  it('normalizes like the Pydantic models', () => {
    const r = transactionWriteSchema.safeParse({ ...base, category: '  ', note: ' hi ', counterparty_type: 'bogus', category_id: 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA' });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data).toMatchObject({
      amount: '250.50',
      counterparty_name: 'Shop',
      category: null,
      note: 'hi',
      counterparty_type: null,
      category_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    });
    expect(r.data.transaction_at.iso).toBe('2026-10-04T10:00:00.000Z');
  });

  it('accepts numbers (C6) and the legacy merchant alias', () => {
    const r = transactionWriteSchema.safeParse({ amount: 12.5, type: 'credit', merchant: 'Acme', transaction_at: '2026-10-04T10:00:00Z' });
    expect(r.success && r.data.amount).toBe('12.50');
    expect(r.success && r.data.counterparty_name).toBe('Acme');
  });

  it('drops server-only fields (S7)', () => {
    const r = transactionWriteSchema.safeParse({
      ...base,
      detected_via: 'sms',
      receipt_url: 'https://evil.example/r.jpg',
      voice_url: 'x',
      user_id: 'someone-else',
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    for (const key of ['detected_via', 'receipt_url', 'voice_url', 'user_id']) expect(r.data).not.toHaveProperty(key);
  });

  it.each([
    [{ ...base, amount: '0' }],
    [{ ...base, amount: '-5' }],
    [{ ...base, amount: '0.004' }],
    [{ ...base, amount: 'abc' }],
    [{ ...base, type: 'transfer' }],
    [{ ...base, counterparty_name: '' }],
    [{ ...base, counterparty_name: 'x'.repeat(201) }],
    [{ ...base, note: 'x'.repeat(2001) }],
    [{ ...base, transaction_at: 'yesterday' }],
    [{ ...base, category_id: 'not-a-uuid' }],
    [{ type: 'debit' }],
  ])('rejects %j', (body) => {
    expect(transactionWriteSchema.safeParse(body).success).toBe(false);
  });
});

describe('idempotency key', () => {
  it('parses like Python', () => {
    expect(parseIdempotencyKey(null)).toBeNull();
    expect(parseIdempotencyKey('   ')).toBeNull();
    expect(parseIdempotencyKey(' 5c0e7d9e-3b0f-4f3c-9a55-0c1d2e3f4a5b ')).toBe('5c0e7d9e-3b0f-4f3c-9a55-0c1d2e3f4a5b');
    expect(parseIdempotencyKey('a'.repeat(100))).toBe('a'.repeat(100));
    for (const bad of ['short', 'a'.repeat(101), 'has space here', '-leading-dash-1', 'emoji-\u{1F600}-key-1']) {
      expect(() => parseIdempotencyKey(bad)).toThrow(ValidationError);
    }
  });
});

describe('media helpers', () => {
  it('resolves bare keys, legacy Supabase URLs and Worker URLs to an R2 key', () => {
    expect(storedMediaKey('receipts/u/receipts/2026-10-04/1-ab.jpg')).toBe('receipts/u/receipts/2026-10-04/1-ab.jpg');
    expect(storedMediaKey('/receipts/a.jpg')).toBe('receipts/a.jpg');
    expect(storedMediaKey('https://x.supabase.co/storage/v1/object/public/Dime/receipts/u/a%20b.jpg?t=1')).toBe('receipts/u/a b.jpg');
    expect(storedMediaKey('https://x.supabase.co/storage/v1/object/sign/Dime-private/voice_inputs/u/v.wav?token=abc')).toBe('voice_inputs/u/v.wav');
    expect(storedMediaKey('https://api.example.workers.dev/media/receipts/u/a%20b.jpg?exp=1&sig=ab')).toBe('receipts/u/a b.jpg');
    expect(storedMediaKey('https://evil.example.com/r.jpg')).toBeNull();
    expect(storedMediaKey('   ')).toBeNull();
  });

  it('builds the private bucket path', () => {
    const now = new Date('2026-10-04T10:11:12.345Z');
    expect(buildObjectPath({ kind: 'receipts', userId: 'U1', extension: '.JPG', now, random: () => 'deadbeef' })).toBe(
      `receipts/U1/receipts/2026-10-04/${now.getTime()}-deadbeef.jpg`,
    );
    expect(buildObjectPath({ kind: 'voice_inputs', userId: 'U1', now, random: () => 'cafebabe' })).toBe(
      `voice_inputs/U1/voice_inputs/2026-10-04/${now.getTime()}-cafebabe.wav`,
    );
    expect(buildObjectPath({ kind: 'receipts', userId: 'U1' })).toMatch(/^receipts\/U1\/receipts\/\d{4}-\d{2}-\d{2}\/\d+-[0-9a-f]{8}\.jpg$/);
  });

  it('sniffs audio containers from magic bytes', () => {
    const bytes = (head: number[] | string, len = 16) => {
      const out = new Uint8Array(len);
      if (typeof head === 'string') out.set(new TextEncoder().encode(head));
      else out.set(head);
      return out;
    };
    expect(detectAudioFormat(bytes('RIFF\0\0\0\0WAVE'))?.ext).toBe('wav');
    const m4a = bytes('\0\0\0\u0018ftypM4A ');
    expect(detectAudioFormat(m4a)).toEqual({ ext: 'm4a', contentType: 'audio/mp4' });
    expect(detectAudioFormat(bytes('ID3\u0004'))?.ext).toBe('mp3');
    expect(detectAudioFormat(bytes([0xff, 0xfb, 0x90]))?.ext).toBe('mp3');
    expect(detectAudioFormat(bytes([0xff, 0xf1, 0x50]))?.ext).toBe('aac');
    expect(detectAudioFormat(bytes('OggS'))?.ext).toBe('ogg');
    expect(detectAudioFormat(bytes([0x1a, 0x45, 0xdf, 0xa3]))?.ext).toBe('webm');
    expect(detectAudioFormat(bytes('caff'))?.ext).toBe('caf');
    expect(detectAudioFormat(bytes('plain text here'))).toBeNull();
    expect(detectAudioFormat(new Uint8Array(4))).toBeNull();
  });

  it('sniffs receipt images (existing core helper used by R3)', () => {
    const png = new Uint8Array(16);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(detectReceiptImageFormat(png)?.ext).toBe('png');
  });
});

describe('aggregates', () => {
  const rows = [
    { amount: '100.00', type: 'credit', transaction_at: '2026-05-21T09:00:00+05:30' },
    { amount: '235.00', type: 'debit', transaction_at: '2026-05-21T13:04:00+05:30' },
    { amount: '50.00', type: 'debit', transaction_at: '2026-05-22T10:00:00+05:30' },
  ];

  it('day summaries group credit, debit, net and count (Python test_day_summaries)', () => {
    const summaries = buildDaySummaries(dayTotalsFromRows(rows, 'Asia/Kolkata'));
    expect(Object.keys(summaries)).toEqual(['2026-05-21', '2026-05-22']);
    expect(summaries['2026-05-21']).toEqual({ date: '2026-05-21', credit_total: '100.00', debit_total: '235.00', fixed_debit_total: '0.00', fixed_credit_total: '0.00', net: '-135.00', transaction_count: 2 });
    expect(summaries['2026-05-22']).toEqual({ date: '2026-05-22', credit_total: '0.00', debit_total: '50.00', fixed_debit_total: '0.00', fixed_credit_total: '0.00', net: '-50.00', transaction_count: 1 });
    expect(buildDaySummaries([])).toEqual({});
  });

  it('splits fixed (recurring-category) money from flexible money per day, per series and in the totals', () => {
    const split = [
      { amount: '15000.00', type: 'debit', transaction_at: '2026-05-21T09:00:00+05:30', is_fixed: true },
      { amount: '200.00', type: 'debit', transaction_at: '2026-05-21T13:00:00+05:30', is_fixed: false },
      { amount: '50000.00', type: 'credit', transaction_at: '2026-05-21T10:00:00+05:30', is_fixed: 1 },
      { amount: '30.00', type: 'credit', transaction_at: '2026-05-22T10:00:00+05:30' },
    ];
    const totals = dayTotalsFromRows(split, 'Asia/Kolkata');
    expect(totals[0]).toMatchObject({ day: '2026-05-21', debitCents: 1520000, fixedDebitCents: 1500000, creditCents: 5000000, fixedCreditCents: 5000000 });
    expect(totals[1]).toMatchObject({ day: '2026-05-22', debitCents: 0, fixedDebitCents: 0, creditCents: 3000, fixedCreditCents: 0 });
    expect(buildDaySummaries(totals)['2026-05-21']).toMatchObject({ debit_total: '15200.00', fixed_debit_total: '15000.00', fixed_credit_total: '50000.00' });
    const days = [21, 22].map((day) => ({ year: 2026, month: 5, day }));
    expect(dailyCashflowSeries(totals, days).map((d) => [d.fixed_debit_total, d.fixed_credit_total])).toEqual([['15000.00', '50000.00'], ['0', '0']]);
    const sum = sumDayTotals(totals);
    expect(sum).toMatchObject({ debitCents: 1520000, fixedDebitCents: 1500000, creditCents: 5003000, fixedCreditCents: 5000000, count: 4 });
    expect(fixedFlexibleFields(sum)).toEqual({
      fixed_debit_total: '15000.00',
      flexible_debit_total: '200.00',
      fixed_credit_total: '50000.00',
      flexible_credit_total: '30.00',
    });
  });

  it('buckets by the user timezone, not UTC', () => {
    // 23:30 UTC is already the next day in Kolkata.
    const totals = dayTotalsFromRows([{ amount: 10, type: 'debit', transaction_at: '2026-05-21T23:30:00+00:00' }], 'Asia/Kolkata');
    expect(totals.map((t) => t.day)).toEqual(['2026-05-22']);
  });

  it('ignores rows that are neither credit nor debit or have bad dates', () => {
    const totals = dayTotalsFromRows(
      [
        { amount: 1, type: 'transfer', transaction_at: '2026-05-21T09:00:00Z' },
        { amount: 1, type: 'debit', transaction_at: 'garbage' },
      ],
      'UTC',
    );
    expect(totals).toEqual([]);
  });

  it('series fill zero days with "0" like Python', () => {
    const totals = dayTotalsFromRows(rows, 'Asia/Kolkata');
    const days = [20, 21, 22].map((day) => ({ year: 2026, month: 5, day }));
    expect(dailyCashflowSeries(totals, days)).toEqual([
      { date: '2026-05-20', debit_total: '0', credit_total: '0', fixed_debit_total: '0', fixed_credit_total: '0' },
      { date: '2026-05-21', debit_total: '235.00', credit_total: '100.00', fixed_debit_total: '0', fixed_credit_total: '0' },
      { date: '2026-05-22', debit_total: '50.00', credit_total: '0', fixed_debit_total: '0', fixed_credit_total: '0' },
    ]);
    expect(dailyDebitSeries(totals, days).map((d) => d.total)).toEqual(['0', '235.00', '50.00']);
  });

  it('debit-by-category response: blank category becomes __uncategorized__, cents become 2-decimal strings', () => {
    const summary = { creditCents: 20000, debitCents: 15050, fixedCreditCents: 0, fixedDebitCents: 0, count: 3, debitByCategory: new Map([['c1', 10000], ['', 5050]]), fixedDebitCategories: new Set<string>() };
    expect(debitByCategoryResponse(summary)).toEqual({ c1: '100.00', __uncategorized__: '50.50' });
  });
});

describe('insights rollups', () => {
  it('top four payees plus Other (Python test_roll_up_counterparty_top_four_plus_other)', () => {
    const source: PayeeRow[] = Array.from({ length: 8 }, (_, i) => ({
      type: 'debit',
      payee_key: `payee-${i}`,
      display_name: `Payee ${i}`,
      total_cents: (100 - i) * 100,
      count: 1,
    }));
    const total = source.reduce((sum, r) => sum + r.total_cents, 0);
    const result = rollUpSpend(source, total);
    expect(result).toHaveLength(5);
    expect(result[0]?.transaction_count).toBe(1);
    expect(result.at(-1)).toMatchObject({ payee_key: '__other__', display_name: 'Other', transaction_count: 4 });
    expect(result.reduce((sum, r) => sum + r.share, 0)).toBeGreaterThan(0.99);
    expect(result.reduce((sum, r) => sum + r.share, 0)).toBeLessThan(1.01);
  });

  it('income lists sources by amount; no spend or income when the month total is zero', () => {
    const rows: PayeeRow[] = [
      { type: 'debit', payee_key: 'swiggy india', display_name: 'Swiggy India', total_cents: 1500, count: 2 },
      { type: 'debit', payee_key: 'unknown', display_name: 'Unknown', total_cents: 700, count: 1 },
      { type: 'credit', payee_key: 'boss', display_name: 'Boss', total_cents: 9900, count: 1 },
    ];
    expect(rollUpIncome(rows, 9900)).toEqual([
      { payee_key: 'boss', display_name: 'Boss', credit_total: '99.00', share: 1, transaction_count: 1 },
    ]);
    expect(rollUpSpend(rows, 0)).toEqual([]);
  });

  it('income with Other: top four payers plus an Other bucket, like spend; the default keeps the top five', () => {
    const rows: PayeeRow[] = Array.from({ length: 7 }, (_, i) => ({
      type: 'credit',
      payee_key: `payer-${i}`,
      display_name: `Payer ${i}`,
      total_cents: (100 - i) * 100,
      count: 1 + i,
    }));
    const total = rows.reduce((sum, r) => sum + r.total_cents, 0);

    const plain = rollUpIncome(rows, total);
    expect(plain.map((r) => r.payee_key)).toEqual(['payer-0', 'payer-1', 'payer-2', 'payer-3', 'payer-4']);

    const withOther = rollUpIncome(rows, total, { withOther: true });
    expect(withOther.map((r) => r.payee_key)).toEqual(['payer-0', 'payer-1', 'payer-2', 'payer-3', '__other__']);
    expect(withOther.at(-1)).toEqual({
      payee_key: '__other__',
      display_name: 'Other',
      credit_total: '285.00', // payers 4, 5 and 6: 96 + 95 + 94
      share: share(9600 + 9500 + 9400, total),
      transaction_count: 5 + 6 + 7,
    });
    const shares = withOther.reduce((sum, r) => sum + r.share, 0);
    expect(shares).toBeGreaterThan(0.99);
    expect(shares).toBeLessThan(1.01);

    // No Other row when four payers or fewer exist.
    expect(rollUpIncome(rows.slice(0, 4), 39400, { withOther: true }).map((r) => r.payee_key)).toEqual(['payer-0', 'payer-1', 'payer-2', 'payer-3']);
  });

  it('share rounds half-even to four decimals', () => {
    expect(share(1, 32)).toBe(0.0312); // 0.03125 -> tie -> even
    expect(share(3, 32)).toBe(0.0938); // 0.09375 -> tie -> even
    expect(share(1, 3)).toBe(0.3333);
    expect(share(2, 3)).toBe(0.6667);
    expect(share(5, 5)).toBe(1);
  });
});

describe('notification text', () => {
  it('formatInr', () => {
    expect(formatInr(500)).toBe('₹500');
    expect(formatInr('20000.00')).toBe('₹20,000');
    expect(formatInr(1234.5)).toBe('₹1,234.50');
    expect(formatInr('1234567.89')).toBe('₹1,234,567.89');
    expect(titleForAutoTx('10')).toBe('₹10 added');
  });
  it('bodyForAutoTx', () => {
    expect(bodyForAutoTx({ merchant: 'Swiggy', category: 'Food' })).toBe('Swiggy · Food');
    expect(bodyForAutoTx({ merchant: '', counterpartyName: 'Shop' })).toBe('Shop');
    expect(bodyForAutoTx({ merchant: '  ', counterpartyName: 'Shop' })).toBe('Transaction'); // Python: '  ' is truthy, then stripped
    expect(bodyForAutoTx({})).toBe('Transaction');
  });
  it('threshold comparison is exact', () => {
    expect(crossedThresholds(8000, 10000, 80)).toEqual({ warn: true, over: false });
    expect(crossedThresholds(7999, 10000, 80)).toEqual({ warn: false, over: false });
    expect(crossedThresholds(10000, 10000, 80)).toEqual({ warn: true, over: false });
    expect(crossedThresholds(10001, 10000, 95)).toEqual({ warn: true, over: true });
  });
});

describe('payee filter patterns (C3)', () => {
  it('matches the normalized payee and the name with a contains pattern', () => {
    expect(payeeLikePatterns('swiggy')).toEqual({ both: ['%swiggy%'], normalized: [] });
  });
  it('adds the normalized form when the input has punctuation, and neutralizes reserved characters', () => {
    expect(payeeLikePatterns("McDonald's, (India)")).toEqual({ both: ["%McDonald's, (India)%"], normalized: ['%mcdonald s india%'] });
    expect(payeeLikePatterns('a"b\\c*d%e')).toEqual({ both: ['%abcde%'], normalized: [] });
    expect(payeeLikePatterns('50_off')).toEqual({ both: ['%50\\_off%'], normalized: ['%50 off%'] });
    expect(payeeLikePatterns('  ')).toBeNull();
    expect(payeeLikePatterns('*%')).toBeNull();
  });
});

describe('payeeKey (same rule as Postgres agent_payee_key)', () => {
  it('prefers the stored normalized value, then the normalized name, then "unknown"', () => {
    expect(payeeKey('swiggy', 'Whatever')).toBe('swiggy');
    expect(payeeKey('  swiggy  ', null)).toBe('swiggy');
    expect(payeeKey(null, '  SWIGGY-India!! ')).toBe('swiggy india');
    expect(payeeKey('', "McDonald's (Andheri)")).toBe('mcdonald s andheri');
    expect(payeeKey('   ', '***')).toBe('unknown');
    expect(payeeKey(null, null)).toBe('unknown');
    expect(payeeKey(undefined, '')).toBe('unknown');
  });
});
