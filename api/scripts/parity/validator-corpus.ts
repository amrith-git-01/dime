/**
 * SQL validator parity: run `validator-corpus.json` through the TypeScript agent SQL validator
 * (real PostgreSQL parser, libpg-query) and diff accept/reject verdicts against the Python reference
 * (sqlglot, backend/features/agent/sql_validator.py).
 *
 *   npx tsx scripts/parity/validator-corpus.ts --run-python     # run both sides and diff (needs `uv`)
 *   npx tsx scripts/parity/validator-corpus.ts --py py.json     # diff against verdicts you produced
 *   npx tsx scripts/parity/validator-corpus.ts                  # TS verdicts only -> .build/validator-ts.json
 *
 * Python side by hand (writes the file `--py` expects):
 *   cd backend && uv run python ../api/scripts/parity/validator_py.py ../api/scripts/parity/validator-corpus.json ../api/scripts/parity/.build/validator-py.json
 *
 * The real validator imports the WASM parser as a Workers `WebAssembly.Module`; under Node we bundle the
 * UNCHANGED source with esbuild and swap only that one import for a module read from disk. Offline: no
 * database, no network.
 *
 * Exit code 1 when the TS validator is MORE PERMISSIVE than Python (a possible security gap) or when it
 * is stricter without an entry in KNOWN_TS_STRICTER below.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const apiRoot = resolve(here, '..', '..');
const buildDir = join(here, '.build');

interface CorpusEntry {
  id: number;
  source: string;
  sql: string;
}
interface Verdict {
  ok: boolean;
  error: string | null;
}

interface Known {
  test: (sql: string, tsError: string | null) => boolean;
  why: string;
}

/**
 * Inputs where the TS validator is deliberately STRICTER than Python. Security rules added in R4
 * (README "SQL validator"), plus inputs only sqlglot accepted but PostgreSQL itself rejects, so they
 * would have failed at execution anyway. `why` is printed in the report.
 */
const KNOWN_TS_STRICTER: Known[] = [
  { test: (s) => /\b(auth|extensions)\s*\.\s*\w+\s*\(/i.test(s), why: 'any non-pg_catalog schema-qualified function (auth.*, extensions.*)' },
  { test: (s) => /\bhttp_\w+\s*\(/i.test(s), why: 'http_* functions (pg_net / http extension)' },
  { test: (s) => /\b(transactions_period_summary|transactions_daily_totals|transactions_payee_totals|update_category_with_budget)\b/i.test(s), why: "this project's own RPCs (they take a user id)" },
  { test: (s) => /::\s*(pg_catalog\.)?reg\w+|\bas\s+(pg_catalog\.)?reg\w+\s*\)|\bto_regclass\b/i.test(s), why: 'reg* casts / to_regclass (catalog lookups by name)' },
  { test: (s) => /\bfrom\s+unnest\s*\(/i.test(s), why: 'FROM-clause functions are limited to generate_series; sqlglot never saw unnest() as a table' },
  { test: (s) => /"[A-Z]\w*"/.test(s), why: 'quoted mixed-case identifiers are different objects in PostgreSQL (Python lower-cased them)' },
  { test: (_s, e) => /null byte|too long/.test(e ?? ''), why: 'input hygiene: null bytes and > 20000 characters are rejected before parsing' },
  { test: (_s, e) => /Could not parse SQL/.test(e ?? ''), why: 'not valid PostgreSQL (sqlglot accepted dialect-lenient syntax such as ":name" placeholders or FROM-first); the database would reject it' },
];

/** TS ACCEPTS what Python rejected, deliberately: read-only, table-checked, still LIMIT-wrapped. */
const KNOWN_TS_PERMISSIVE: Known[] = [
  { test: (s) => /^\s*(values\b|table\s)/i.test(s), why: 'top-level VALUES / TABLE are plain read-only SELECT forms in PostgreSQL (TABLE x is literally SELECT * FROM x); every table is still allowlisted and the result LIMIT-wrapped' },
];

function errorClass(error: string | null): string {
  if (!error) return '-';
  if (/^EXCEPTION/.test(error)) return 'exception';
  if (/SQL is empty/.test(error)) return 'empty';
  if (/null byte/.test(error)) return 'null-byte';
  if (/too long/.test(error)) return 'too-long';
  if (/Multiple statements/.test(error)) return 'multiple';
  if (/Only SELECT/.test(error)) return 'only-select';
  if (/Forbidden SQL keyword/.test(error)) return 'keyword';
  if (/Forbidden function/.test(error)) return 'function';
  if (/Disallowed tables|Could not resolve tables/.test(error)) return 'tables';
  if (/Could not parse/.test(error)) return 'parse';
  return 'other';
}

async function loadTsValidator(): Promise<(sql: string) => Promise<{ ok: boolean; error?: string }>> {
  mkdirSync(buildDir, { recursive: true });
  const wasmPath = join(apiRoot, 'node_modules', 'libpg-query', 'wasm', 'libpg-query.wasm');
  const outfile = join(buildDir, 'sql-validator.mjs');
  await build({
    entryPoints: [join(apiRoot, 'src', 'features', 'agent', 'sql-validator.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    logLevel: 'silent',
    external: ['libpg-query/wasm/libpg-query.js'],
    plugins: [
      {
        name: 'wasm-from-disk',
        setup(b) {
          b.onResolve({ filter: /libpg-query\/wasm\/libpg-query\.wasm$/ }, () => ({ path: 'libpg-query.wasm', namespace: 'wasm-from-disk' }));
          b.onLoad({ filter: /.*/, namespace: 'wasm-from-disk' }, () => ({
            contents: `import { readFileSync } from 'node:fs'; export default new WebAssembly.Module(readFileSync(${JSON.stringify(wasmPath)}));`,
            loader: 'js',
          }));
        },
      },
    ],
  });
  const mod = (await import(pathToFileURL(outfile).href)) as { validateSelectSql: (sql: string, o?: { maxRows?: number }) => Promise<{ ok: boolean; error?: string }> };
  return (sql) => mod.validateSelectSql(sql);
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function runPython(corpusPath: string, outPath: string): void {
  const backend = resolve(apiRoot, '..', 'backend');
  const script = join(here, 'validator_py.py');
  const res = spawnSync('uv', ['run', 'python', script, corpusPath, outPath], { cwd: backend, encoding: 'utf8', shell: process.platform === 'win32', env: { ...process.env, PYTHONUTF8: '1' } });
  if (res.status !== 0) {
    console.error(res.stdout, res.stderr);
    throw new Error('Python validator run failed (is `uv` installed and `cd backend && uv sync` done?)');
  }
  console.log(res.stdout.trim());
}

const clip = (s: string, n = 150) => (s.length > n ? `${s.slice(0, n)}... (${s.length} chars)` : s).replace(/\s+/g, ' ');

async function main(): Promise<number> {
  const corpusPath = join(here, 'validator-corpus.json');
  const corpus = JSON.parse(readFileSync(corpusPath, 'utf8')) as CorpusEntry[];
  const validate = await loadTsValidator();

  const ts: Record<string, Verdict> = {};
  for (const entry of corpus) {
    try {
      const r = await validate(entry.sql);
      ts[entry.id] = { ok: r.ok, error: r.error ?? null };
    } catch (err) {
      ts[entry.id] = { ok: false, error: `EXCEPTION ${err instanceof Error ? err.message : String(err)}` };
    }
  }
  mkdirSync(buildDir, { recursive: true });
  writeFileSync(join(buildDir, 'validator-ts.json'), JSON.stringify(ts, null, 1));
  const accepted = Object.values(ts).filter((v) => v.ok).length;
  console.log(`TS validator: ${corpus.length} inputs, ${accepted} accepted, ${corpus.length - accepted} rejected -> scripts/parity/.build/validator-ts.json`);

  let pyPath = arg('--py');
  if (process.argv.includes('--run-python')) {
    pyPath = join(buildDir, 'validator-py.json');
    runPython(corpusPath, pyPath);
  }
  if (!pyPath) {
    console.log('No Python verdicts given (use --run-python or --py FILE); nothing to diff.');
    return 0;
  }
  const py = JSON.parse(readFileSync(pyPath, 'utf8')) as Record<string, Verdict>;

  let agree = 0;
  const permissive: string[] = [];
  const permissiveKnown: string[] = [];
  const stricterKnown: string[] = [];
  const stricterUnknown: string[] = [];
  const classDiffs: string[] = [];
  for (const entry of corpus) {
    const p = py[entry.id];
    const t = ts[entry.id];
    if (!p || !t) {
      permissive.push(`#${entry.id} missing verdict`);
      continue;
    }
    if (p.ok === t.ok) {
      agree++;
      if (!p.ok && errorClass(p.error) !== errorClass(t.error)) {
        classDiffs.push(`#${entry.id} [${entry.source}] py=${errorClass(p.error)} ts=${errorClass(t.error)} :: ${clip(entry.sql, 90)}`);
      }
      continue;
    }
    const line = `#${entry.id} [${entry.source}] ${clip(entry.sql)}\n      py: ${p.ok ? 'ACCEPT' : `reject (${clip(p.error ?? '', 100)})`}\n      ts: ${t.ok ? 'ACCEPT' : `reject (${clip(t.error ?? '', 100)})`}`;
    if (t.ok && !p.ok) {
      const known = KNOWN_TS_PERMISSIVE.find((k) => k.test(entry.sql, p.error));
      if (known) permissiveKnown.push(`${line}
      why: ${known.why}`);
      else permissive.push(line);
    } else {
      const known = KNOWN_TS_STRICTER.find((k) => k.test(entry.sql, t.error));
      if (known) stricterKnown.push(`${line}\n      why: ${known.why}`);
      else stricterUnknown.push(line);
    }
  }

  console.log(`\nVerdicts agree: ${agree}/${corpus.length}`);
  console.log(`TS stricter (documented intentional): ${stricterKnown.length}`);
  console.log(`TS stricter (UNDOCUMENTED, review): ${stricterUnknown.length}`);
  console.log(`TS more permissive than Python (documented intentional): ${permissiveKnown.length}`);
  console.log(`TS more permissive than Python (REVIEW, possible gap): ${permissive.length}`);
  console.log(`Both reject but with a different reason class (informational): ${classDiffs.length}`);
  if (stricterKnown.length) console.log(`\n--- TS stricter, intentional ---\n${stricterKnown.join('\n')}`);
  if (stricterUnknown.length) console.log(`\n--- TS stricter, UNDOCUMENTED ---\n${stricterUnknown.join('\n')}`);
  if (permissiveKnown.length) console.log(`\n--- TS more permissive, intentional ---\n${permissiveKnown.join('\n')}`);
  if (permissive.length) console.log(`\n--- TS MORE PERMISSIVE ---\n${permissive.join('\n')}`);
  if (classDiffs.length && process.argv.includes('--verbose')) console.log(`\n--- reason class differs ---\n${classDiffs.join('\n')}`);
  return permissive.length || stricterUnknown.length ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err);
    process.exit(2);
  },
);
