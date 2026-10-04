/**
 * Unsubscribe-token cross-check, both directions, against the real Python implementation
 * (backend/features/email/tokens.py). Offline (no network, no database); needs `uv`.
 *
 *   npx tsx scripts/parity/tokens-check.ts
 *
 *  - TS-signed tokens must be byte-identical to Python-signed ones for the same inputs;
 *  - each side must verify the other's tokens, and both must reject the same bad ones
 *    (tampered HMAC, wrong secret, wrong kind, older than 90 days, issued in the future).
 *
 * Also run by `parity.ts --tokens`.
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { signUnsubscribeToken, verifyUnsubscribeToken } from '../../src/features/email/tokens';

const here = dirname(fileURLToPath(import.meta.url));
const backend = resolve(here, '..', '..', '..', 'backend');

const SECRET = 'parity-secret-ü-with-non-ascii';
const USER = '11111111-2222-3333-4444-555555555555';
const NOW = 1_790_000_000;
const DAY = 86_400;

interface PyCase {
  op: 'sign' | 'verify';
  user_id?: string;
  kind?: string;
  now_ts: number;
  token?: string;
  secret?: string;
}

function python(secret: string, cases: PyCase[]): Record<string, unknown>[] {
  const res = spawnSync('uv', ['run', 'python', resolve(here, 'py_tokens.py')], {
    cwd: backend,
    input: JSON.stringify({ secret, cases }),
    encoding: 'utf8',
    env: { ...process.env, PYTHONUTF8: '1' }, // stdin is UTF-8 JSON; Windows would default to cp1252
    shell: process.platform === 'win32',
  });
  if (res.status !== 0) throw new Error(`Python token helper failed (is \`uv\` installed and \`cd backend && uv sync\` done?)\n${res.stderr}`);
  return JSON.parse(res.stdout) as Record<string, unknown>[];
}

export async function runTokenCrossCheck(): Promise<boolean> {
  const failures: string[] = [];
  const check = (name: string, ok: boolean, detail = ''): void => {
    if (!ok) failures.push(`${name}${detail ? `: ${detail}` : ''}`);
  };

  // 1. Signing: identical bytes.
  const kinds = ['weekly', 'monthly'] as const;
  const signCases = kinds.map((kind) => ({ op: 'sign' as const, user_id: USER, kind, now_ts: NOW }));
  const pySigned = python(SECRET, signCases);
  const tsSigned = await Promise.all(kinds.map((kind) => signUnsubscribeToken({ secret: SECRET, userId: USER, kind, nowTs: NOW })));
  kinds.forEach((kind, i) => check(`sign ${kind} identical`, pySigned[i]?.['token'] === tsSigned[i], `py=${String(pySigned[i]?.['token'])} ts=${tsSigned[i]}`));

  // 2. Verification of good tokens, both directions, at "NOW + 1 day".
  const at = NOW + DAY;
  const pyVerifyTs = python(SECRET, tsSigned.map((token) => ({ op: 'verify' as const, token, now_ts: at })));
  const tsVerifyPy = await Promise.all(pySigned.map((r) => verifyUnsubscribeToken({ secret: SECRET, token: String(r['token']), nowTs: at })));
  kinds.forEach((kind, i) => {
    check(`python verifies TS-signed ${kind}`, JSON.stringify(pyVerifyTs[i]?.['result']) === JSON.stringify({ user_id: USER, kind }));
    check(`TS verifies Python-signed ${kind}`, tsVerifyPy[i]?.userId === USER && tsVerifyPy[i]?.kind === kind);
  });

  // 3. Rejections must agree.
  const good = tsSigned[0] as string;
  const parts = good.split('|');
  const bad: { name: string; token: string; nowTs: number; secret?: string }[] = [
    { name: 'tampered hmac', token: `${parts.slice(0, 3).join('|')}|${'0'.repeat(64)}`, nowTs: at },
    { name: 'tampered user', token: `${USER.replace('1', '9')}|${parts.slice(1).join('|')}`, nowTs: at },
    { name: 'wrong kind', token: `${USER}|daily|${NOW}|${parts[3]}`, nowTs: at },
    { name: 'wrong secret', token: good, nowTs: at, secret: 'another-secret' },
    { name: 'older than 90 days', token: good, nowTs: NOW + 91 * DAY },
    { name: 'issued in the future', token: good, nowTs: NOW - 120 },
    { name: 'too few parts', token: `${USER}|weekly|${NOW}`, nowTs: at },
    { name: 'non-numeric issued', token: `${USER}|weekly|abc|${parts[3]}`, nowTs: at },
  ];
  const pyBad = python(SECRET, bad.map((b) => ({ op: 'verify' as const, token: b.token, now_ts: b.nowTs, ...(b.secret ? { secret: b.secret } : {}) })));
  for (const [i, b] of bad.entries()) {
    const ts = await verifyUnsubscribeToken({ secret: b.secret ?? SECRET, token: b.token, nowTs: b.nowTs });
    check(`reject "${b.name}" (python)`, pyBad[i]?.['result'] === null, JSON.stringify(pyBad[i]));
    check(`reject "${b.name}" (ts)`, ts === null, JSON.stringify(ts));
  }
  // Boundary: exactly 90 days is still valid on both sides; 60 s of clock skew is tolerated.
  const edge = python(SECRET, [
    { op: 'verify', token: good, now_ts: NOW + 90 * DAY },
    { op: 'verify', token: good, now_ts: NOW - 60 },
  ]);
  const tsEdge = [await verifyUnsubscribeToken({ secret: SECRET, token: good, nowTs: NOW + 90 * DAY }), await verifyUnsubscribeToken({ secret: SECRET, token: good, nowTs: NOW - 60 })];
  edge.forEach((r, i) => check(`edge case ${i} agrees`, (r['result'] !== null) === (tsEdge[i] !== null), JSON.stringify([r, tsEdge[i]])));

  if (failures.length) {
    console.error(`Unsubscribe token cross-check FAILED (${failures.length}):\n - ${failures.join('\n - ')}`);
    return false;
  }
  console.log(`Unsubscribe token cross-check OK: sign byte-identical, verify both directions, ${bad.length} rejections + 2 edge cases agree.`);
  return true;
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('tokens-check.ts')) {
  runTokenCrossCheck().then(
    (ok) => process.exit(ok ? 0 : 1),
    (err: unknown) => {
      console.error(err);
      process.exit(2);
    },
  );
}
