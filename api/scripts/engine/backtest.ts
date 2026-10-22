/**
 * Replays a user's past months through the predictive engine and reports how good the forecasts would have been
 * (docs/PREDICTIVE-ENGINE-PLAN.md section 12). Read-only: it opens the local D1 and writes nothing.
 *
 *   npx wrangler dev                                  # once, so the local D1 exists (or import data into it)
 *   npm run engine:backtest -- --user <user id> --months 3
 *
 * Flags: --user <id>      default: the user with the most transactions
 *        --months <n>     complete months before the current one (default 3)
 *        --days 7,14,21   days of the month to forecast on (default 7,14,21); --daily = every day
 *        --window <days>  baseline window, 60 / 90 / 120 (default 90)
 *        --width <x>      range width multiplier (default 1)
 *        --persist-to <dir>  where `wrangler dev` keeps its state (default .wrangler/state/v3, the folder that holds d1/)
 *
 * Each forecast is made as of the start of that local day from the rows known then: landing = debits so far + the month's
 * recurring bills (read from the rows, as if the recurring items had been known) + the forecast flexible spend still to come.
 * Error is |p50 - actual| / actual of the whole month; coverage is the share of actuals inside p10..p90.
 */
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { getPlatformProxy } from 'wrangler';

import { addDays, localDate, monthRange, startOfLocalDay } from '../../src/core/timezone';
import { replayMonth } from '../../src/features/engine/backtest';
import type { ReplayPoint } from '../../src/features/engine/backtest';
import { median } from '../../src/features/engine/math';
import { loadEngineRowsBetween, loadFirstTransactionAt, resolveTimezone } from '../../src/features/engine/patterns';
import { LOOKBACK_DAYS } from '../../src/features/engine/types';

const { values } = parseArgs({
  options: {
    user: { type: 'string' },
    months: { type: 'string', default: '3' },
    days: { type: 'string', default: '7,14,21' },
    daily: { type: 'boolean', default: false },
    window: { type: 'string', default: '90' },
    width: { type: 'string', default: '1' },
    'persist-to': { type: 'string', default: '.wrangler/state/v3' },
  },
});

/** The database as the script may use it: statements that read, nothing else. */
function readOnly(db: D1Database): D1Database {
  const refuse = (what: string) => () => {
    throw new Error(`The backtest is read-only: ${what} is not allowed.`);
  };
  return {
    prepare: (sql: string) => {
      if (!/^\s*(select|with)\b/i.test(sql)) throw new Error(`The backtest is read-only: refusing "${sql.slice(0, 40)}".`);
      return db.prepare(sql);
    },
    batch: refuse('batch'),
    exec: refuse('exec'),
    dump: refuse('dump'),
    withSession: refuse('withSession'),
  };
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const rupees = (paise: number) => (paise / 100).toFixed(0).padStart(8);

async function main() {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: resolve(import.meta.dirname, '../../wrangler.jsonc'),
    persist: { path: resolve(values['persist-to']) },
    remoteBindings: false,
  });
  try {
    const db = readOnly(proxy.env.DB);
    const userId =
      values.user ??
      (await db.prepare('SELECT user_id FROM transactions WHERE deleted_at IS NULL GROUP BY user_id ORDER BY COUNT(*) DESC LIMIT 1').first<{ user_id: string }>())?.user_id;
    if (!userId) {
      console.log('No transactions in the local database: nothing to replay.');
      return;
    }
    const tz = await resolveTimezone(db, userId);
    const months = Math.max(1, Number(values.months));
    const windowDays = Number(values.window);
    const widthFactor = Number(values.width);
    const now = localDate(tz, Date.now());
    const list: Array<{ year: number; month: number }> = [];
    for (let y = now.year, m = now.month, i = 0; i < months; i++) {
      m -= 1;
      if (m === 0) [m, y] = [12, y - 1];
      list.unshift({ year: y, month: m });
    }
    const first = list[0] as { year: number; month: number };
    const last = list[list.length - 1] as { year: number; month: number };
    const fromMs = startOfLocalDay(tz, addDays({ ...first, day: 1 }, -LOOKBACK_DAYS));
    const toMs = Date.parse(monthRange(tz, last.year, last.month).to) - 1;
    const [rows, firstTransactionAt] = await Promise.all([loadEngineRowsBetween(db, userId, fromMs, toMs), loadFirstTransactionAt(db, userId)]);

    console.log(`user ${userId}  tz ${tz}  window ${windowDays}d  width x${widthFactor}  ${rows.length} rows, first transaction ${firstTransactionAt ?? 'none'}\n`);
    const scored: ReplayPoint[] = [];
    for (const { year, month } of list) {
      const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const days = values.daily ? Array.from({ length: daysInMonth }, (_, i) => i + 1) : (values.days).split(',').map(Number);
      const points = replayMonth(rows, tz, year, month, days, { windowDays, widthFactor, seed: userId, firstTransactionAt });
      console.log(`${year}-${String(month).padStart(2, '0')}  actual ${rupees(points[0]?.actualTotal ?? 0)}`);
      for (const p of points) {
        if (p.mode === 'learning' || p.actualTotal <= 0) {
          console.log(`  day ${String(p.day).padStart(2)}  not enough history (${p.mode})`);
          continue;
        }
        const error = Math.abs(p.landing.p50 - p.actualTotal) / p.actualTotal;
        const covered = p.landing.p10 <= p.actualTotal && p.actualTotal <= p.landing.p90;
        console.log(`  day ${String(p.day).padStart(2)}  p10 ${rupees(p.landing.p10)}  p50 ${rupees(p.landing.p50)}  p90 ${rupees(p.landing.p90)}  error ${pct(error).padStart(6)}  ${covered ? 'inside' : 'OUTSIDE'}`);
        scored.push(p);
      }
    }
    if (scored.length === 0) {
      console.log('\nNot enough history to score any forecast.');
      return;
    }
    const errors = scored.map((p) => Math.abs(p.landing.p50 - p.actualTotal) / p.actualTotal);
    const inside = scored.filter((p) => p.landing.p10 <= p.actualTotal && p.actualTotal <= p.landing.p90).length;
    console.log(`\n${scored.length} forecasts: median error ${pct(median(errors))}, mean error ${pct(errors.reduce((a, b) => a + b, 0) / errors.length)}, coverage ${pct(inside / scored.length)}`);
  } finally {
    await proxy.dispose();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
