import { describe, expect, it } from 'vitest';

import { NOT_FROM_DIME_NOTICE, parsePayQuery, upiLink } from '../src/features/reminders/pay';
import { call, makeEnv } from './helpers';

const get = (query: string) => call(`/pay${query}`, { token: false, env: makeEnv({ WRITE_LIMITER: undefined }) });
const q = (params: Record<string, string>) => `?${new URLSearchParams(params).toString()}`;

describe('GET /pay', () => {
  it('shows who and how much, links to the UPI app, and needs no login', async () => {
    const res = await get(q({ pa: 'ravi@okhdfc', am: '1234.5', pn: 'Ravi Kumar', tn: 'Rent for Oct' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^text\/html/);
    const html = await res.text();
    expect(html).toContain('Pay ₹1,234.50 to Ravi Kumar');
    expect(html).toContain('href="upi://pay?pa=ravi@okhdfc&amp;pn=Ravi%20Kumar&amp;am=1234.50&amp;cu=INR&amp;tn=Rent%20for%20Oct"');
    expect(html).toContain('<code>ravi@okhdfc</code>'); // the UPI id is shown so the payer can check it
    expect(html).toContain('Rent for Oct');
    // Anyone can craft a link: the page says so, and the payer must tap the button (no script, no automatic redirect).
    expect(html).toContain('This link was not created by Dime. Check the UPI ID before paying.');
    expect(html).not.toMatch(/<script|setTimeout|location|http-equiv|refresh/i);
  });

  it('the notice is on every valid page, and not on the invalid one', async () => {
    expect(await (await get(q({ pa: 'ravi@okhdfc' }))).text()).toContain(NOT_FROM_DIME_NOTICE);
    expect(await (await get(q({ pa: 'nope' }))).text()).not.toContain(NOT_FROM_DIME_NOTICE);
  });

  it('only the UPI id is required', async () => {
    const html = await (await get(q({ pa: 'ravi@okhdfc' }))).text();
    expect(html).toContain('Pay with UPI');
    expect(html).toContain('href="upi://pay?pa=ravi@okhdfc&amp;cu=INR"');
    expect(await (await get(q({ pa: 'ravi@okhdfc', am: '500' }))).text()).toContain('Pay ₹500');
    expect(await (await get(q({ pa: 'ravi@okhdfc', pn: 'Ravi' }))).text()).toContain('Pay Ravi');
    // An empty optional parameter counts as absent.
    expect((await get('?pa=ravi@okhdfc&am=&pn=&tn=')).status).toBe(200);
  });

  it('sends the privacy and security headers', async () => {
    const res = await get(q({ pa: 'ravi@okhdfc', am: '10' }));
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-robots-tag')).toBe('noindex');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('set-cookie')).toBeNull();
    const csp = res.headers.get('content-security-policy') ?? '';
    const html = await res.text();
    const nonce = /nonce="([^"]+)"/.exec(html)?.[1] ?? '';
    expect(nonce).not.toBe('');
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain(`style-src 'nonce-${nonce}'`);
    expect(csp).not.toContain('script'); // no script runs, so none is allowed
    expect(csp).toContain("frame-ancestors 'none'");
    // The style tag carries that nonce; there is no script and nothing is loaded from elsewhere.
    expect(html.match(/<style(?![^>]*nonce=)/g)).toBeNull();
    expect(html).not.toContain('<script');
    expect(html).not.toMatch(/<(?:link|img|iframe)\b|src=|https?:\/\//i);
    // A fresh nonce per request.
    const other = /nonce="([^"]+)"/.exec(await (await get(q({ pa: 'ravi@okhdfc' }))).text())?.[1];
    expect(other).not.toBe(nonce);
  });

  describe('invalid links answer a static 400 page that echoes nothing', () => {
    const cases: [string, Record<string, string> | string][] = [
      ['no parameters', ''],
      ['missing pa', { am: '10' }],
      ['pa without @', { pa: 'ravi' }],
      ['pa with a short handle', { pa: 'ravi@o' }],
      ['pa with a short name', { pa: 'r@okhdfc' }],
      ['pa with a space', { pa: 'ra vi@okhdfc' }],
      ['pa with markup', { pa: '<script>alert(1)</script>@okhdfc' }],
      ['pa too long', { pa: `${'a'.repeat(65)}@okhdfc` }],
      ['am not a number', { pa: 'ravi@okhdfc', am: 'abc' }],
      ['am negative', { pa: 'ravi@okhdfc', am: '-5' }],
      ['am zero', { pa: 'ravi@okhdfc', am: '0' }],
      ['am 0.00', { pa: 'ravi@okhdfc', am: '0.00' }],
      ['am with three decimals', { pa: 'ravi@okhdfc', am: '1.234' }],
      ['am above the cap', { pa: 'ravi@okhdfc', am: '1000000.01' }],
      ['am with an exponent', { pa: 'ravi@okhdfc', am: '1e3' }],
      ['am with a comma', { pa: 'ravi@okhdfc', am: '1,000' }],
      ['pn with markup', { pa: 'ravi@okhdfc', pn: '<img src=x onerror=alert(1)>' }],
      ['pn with a quote', { pa: 'ravi@okhdfc', pn: 'Ra"vi' }],
      ['pn too long', { pa: 'ravi@okhdfc', pn: 'a'.repeat(41) }],
      ['pn posing as Dime', { pa: 'ravi@okhdfc', pn: 'Dime Support' }],
      ['pn posing as Dime, any case', { pa: 'ravi@okhdfc', pn: 'official DIME payments' }],
      ['pn with dime inside a word', { pa: 'ravi@okhdfc', pn: 'dimes' }],
      ['tn with a script', { pa: 'ravi@okhdfc', tn: '<script>alert(1)</script>' }],
      ['tn with a control character', { pa: 'ravi@okhdfc', tn: 'line\nbreak' }],
      ['tn too long', { pa: 'ravi@okhdfc', tn: 'a'.repeat(81) }],
    ];
    it.each(cases)('%s', async (_name, query) => {
      const res = await get(typeof query === 'string' ? query : q(query));
      expect(res.status).toBe(400);
      const html = await res.text();
      expect(html).toContain("This payment link isn't valid");
      expect(html).not.toContain('upi://');
      expect(html).not.toMatch(/alert|onerror|ra"vi|<img|ravi|support/i);
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(res.headers.get('x-robots-tag')).toBe('noindex');
      expect(res.headers.get('content-security-policy')).toContain("default-src 'none'");
    });
  });

  it('the limits themselves are valid: 0.01, 1000000, 40-letter name, 80-character note', async () => {
    const limits: Record<string, string>[] = [
      { pa: 'ravi@okhdfc', am: '0.01' },
      { pa: 'ravi@okhdfc', am: '1000000' },
      { pa: 'ravi@okhdfc', pn: 'a'.repeat(40) },
      { pa: 'ravi@okhdfc', tn: 'a'.repeat(80) },
      { pa: `${'a'.repeat(64)}@${'b'.repeat(32)}` },
    ];
    for (const query of limits) {
      expect((await get(q(query))).status, JSON.stringify(query)).toBe(200);
    }
  });

  it('values are encoded in the link and escaped in the page; nothing unvalidated is echoed', async () => {
    // Characters the allow-list permits but HTML and URLs treat specially.
    expect((await get(q({ pa: 'ravi@okhdfc', pn: "O'Brien & Sons" }))).status).toBe(400); // quotes and `&` are not allowed in a name
    const ok = await get(q({ pa: 'ravi@okhdfc', pn: "O.Brien", tn: "Tom & Jerry's (rent) #1 100%" }));
    expect(ok.status).toBe(200);
    const html = await ok.text();
    expect(html).toContain('Tom &amp; Jerry&#39;s (rent) #1 100%');
    expect(html).toContain('tn=Tom%20%26%20Jerry&#39;s%20(rent)%20%231%20100%25'); // percent-encoded for the link, then attribute-escaped
    expect(html).not.toContain("Jerry's (rent)"); // the raw apostrophe never reaches the markup
  });

  it('extra and repeated parameters are ignored, never echoed', async () => {
    const res = await get('?pa=ravi@okhdfc&pa=evil@okhdfc&x=%3Cscript%3E&am=5');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('ravi@okhdfc');
    expect(html).not.toMatch(/evil|<script>|x=/);
  });

  it('is rate limited by the shared limiter when it says no', async () => {
    const res = await call('/pay?pa=ravi@okhdfc', { token: false, env: makeEnv({ WRITE_LIMITER: { limit: () => Promise.resolve({ success: false }) } }) });
    expect(res.status).toBe(429);
  });

  it('is not an API route (no /api/v1 prefix, no auth) and the root keeps working', async () => {
    expect((await call('/api/v1/pay?pa=ravi@okhdfc', { token: false })).status).toBe(404);
    expect((await call('/', { token: false })).status).toBe(200);
  });
});

describe('parsePayQuery / upiLink', () => {
  it('normalises the amount and trims', () => {
    expect(parsePayQuery({ pa: ' ravi@okhdfc ', am: '5', pn: ' Ravi ' })).toEqual({ pa: 'ravi@okhdfc', am: '5.00', pn: 'Ravi', tn: undefined });
    expect(parsePayQuery({})).toBeNull();
  });

  it('builds the upi:// link with the id unescaped and everything else percent-encoded', () => {
    expect(upiLink({ pa: 'ravi.k-1@okhdfc', am: '10.00', pn: 'Ravi K', tn: 'a/b' })).toBe('upi://pay?pa=ravi.k-1@okhdfc&pn=Ravi%20K&am=10.00&cu=INR&tn=a%2Fb');
  });
});
