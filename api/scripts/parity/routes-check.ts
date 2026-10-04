/**
 * Frontend <-> API route coverage. Scans `frontend/src` for `dimeApi.<method>(<path>)` calls (and the
 * receipt / voice upload paths) and checks each (METHOD, path) has a route in the Hono app.
 * Offline; exits 1 when the app calls an endpoint the TS API does not serve.
 *
 *   npx tsx scripts/parity/routes-check.ts
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { app } from '../../src/app';

const here = dirname(fileURLToPath(import.meta.url));
const frontendSrc = resolve(here, '..', '..', '..', 'frontend', 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

const norm = (path: string): string => path.replace(/\$\{[^}]*\}/g, ':p').replace(/:[A-Za-z_]+/g, ':p').replace(/\/+$/, '') || '/';

interface Call {
  method: string;
  path: string;
  file: string;
}

const calls: Call[] = [];
const CALL = /dimeApi\s*\.\s*(get|post|put|patch|delete)\b[^(]*\(\s*([`"'])(\/api\/v1[^`"']*)\2/gs;
for (const file of walk(frontendSrc)) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(CALL)) calls.push({ method: (m[1] as string).toUpperCase(), path: norm(m[3] as string), file: relative(frontendSrc, file) });
  // Uploads go through a typed `path` option: `path: "/api/v1/transactions/receipt" | ".../voice"`.
  for (const m of text.matchAll(/path:\s*"(\/api\/v1\/transactions\/(?:receipt|voice))"/g)) {
    calls.push({ method: 'POST', path: norm(m[1] as string), file: relative(frontendSrc, file) });
  }
}

const routes = new Set<string>();
for (const r of app.routes) if (r.method !== 'ALL') routes.add(`${r.method} ${norm(r.path)}`);

const unique = new Map<string, Call>();
for (const c of calls) unique.set(`${c.method} ${c.path}`, c);

const missing: string[] = [];
for (const [key, c] of [...unique].sort(([a], [b]) => a.localeCompare(b))) {
  const ok = routes.has(key);
  console.log(`${ok ? 'ok     ' : 'MISSING'} ${key.padEnd(52)} ${c.file}`);
  if (!ok) missing.push(key);
}
console.log(`\n${unique.size} distinct frontend calls, ${missing.length} without a TS route.`);
process.exit(missing.length ? 1 : 0);
