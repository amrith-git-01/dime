import { all, first } from '../../core/db';
import type { Db, SqlParam } from '../../core/db';
import { isoUtc } from '../../core/timestamps';
import { fetchMetaByIds } from '../categories/repository';
import { normalizeCounterparty } from '../transactions/dedupe';
import type { BrandItem, CategoryRef, PayeeSuggestion } from './schemas';

/**
 * FTS5 MATCH expression for a typed query: every normalised word becomes a quoted prefix term (`"swi"*`), all of them ANDed.
 * Normalisation leaves only `[a-z0-9]` and spaces, so quoting is enough to keep user input from becoming FTS syntax.
 * Null when nothing searchable is left.
 */
export function buildMatchExpression(raw: string): string | null {
  const words = normalizeCounterparty(raw).split(' ').filter(Boolean);
  return words.length ? words.map((w) => `"${w}"*`).join(' ') : null;
}

interface BrandDbRow {
  id: string;
  name: string;
  domain: string | null;
  logo_url: string | null;
  category_id: string | null;
  category_name: string | null;
  category_icon_name: string | null;
  category_color: string | null;
}

/** `GET /brands/search`: catalogue prefix search (name and aliases), most popular first. */
export async function searchBrands(db: Db, q: string, limit: number): Promise<{ items: BrandItem[] }> {
  const match = buildMatchExpression(q);
  if (!match) return { items: [] };
  const rows = await all<BrandDbRow>(
    db,
    `SELECT b.id, b.name, b.domain, b.logo_url, b.category_id,
            c.name AS category_name, c.icon_name AS category_icon_name, c.color AS category_color
     FROM brands_fts
     JOIN brands b ON b.id = brands_fts.brand_id
     LEFT JOIN categories c ON c.id = b.category_id
     WHERE brands_fts MATCH ?
     -- A brand whose own name starts with the query ("ola" -> Ola) beats a more popular alias-only match.
     ORDER BY (lower(replace(replace(b.name, '''', ''), '.', '')) LIKE ?) DESC, b.popularity DESC, bm25(brands_fts), b.id
     LIMIT ?`,
    [match, `${normalizeCounterparty(q)}%`, limit],
  );
  return {
    items: rows.map((r) => ({
      id: r.id,
      name: r.name,
      domain: r.domain,
      logo_url: r.logo_url,
      category: r.category_id
        ? { id: r.category_id, name: r.category_name ?? '', icon_name: r.category_icon_name, color: r.category_color }
        : null,
    })),
  };
}

/** The id of a catalogue brand, or null when it does not exist (or `id` is blank). */
export async function existingBrandId(db: Db, id: string | null | undefined): Promise<string | null> {
  const key = id?.trim();
  if (!key) return null;
  return (await first<{ id: string }>(db, 'SELECT id FROM brands WHERE id = ?', [key]))?.id ?? null;
}

/** The brand a typed / captured payee name belongs to, through the alias table (aliases are normalised like `payee_key`). */
export async function resolveBrandId(db: Db, counterpartyName: string): Promise<string | null> {
  const alias = normalizeCounterparty(counterpartyName);
  if (!alias) return null;
  return (await first<{ brand_id: string }>(db, 'SELECT brand_id FROM brand_aliases WHERE alias = ?', [alias]))?.brand_id ?? null;
}

const DAY_MS = 86_400_000;
const RECENT_DAYS = 90;
const COUNTERPARTY_TYPES: ReadonlySet<string> = new Set(['merchant', 'person', 'self_transfer', 'unknown']);

interface SuggestionDbRow {
  brand_id: string | null;
  counterparty_name: string | null;
  payee_key: string;
  counterparty_type: string | null;
  category_id: string | null;
  n: number;
  last_at: string;
  brand_name: string | null;
  domain: string | null;
}

/**
 * `GET /payees/suggestions`: the user's own payees of one type, grouped by brand (else payee key) so spellings of
 * one brand count together. Ranked by frequency, with the last 90 days counting double, then by recency.
 */
export async function payeeSuggestions(
  db: Db,
  userId: string,
  opts: { type: 'debit' | 'credit'; q?: string | undefined; limit: number },
  nowMs: number = Date.now(),
): Promise<{ items: PayeeSuggestion[] }> {
  const recentFrom = new Date(nowMs - RECENT_DAYS * DAY_MS).toISOString();
  const params: SqlParam[] = [userId, opts.type, recentFrom];
  let filter = '';
  const nq = normalizeCounterparty(opts.q ?? '');
  if (nq) {
    // `nq` is [a-z0-9 ] only, so it carries no LIKE wildcards: prefix of the key or of any word in it, or of any
    // spelling of the group's brand (aliases are normalised the same way, so "mcdonalds" finds McDonald's).
    filter =
      'AND (r.payee_key LIKE ? OR r.payee_key LIKE ? OR EXISTS (SELECT 1 FROM brand_aliases a WHERE a.brand_id = r.brand_id AND (a.alias LIKE ? OR a.alias LIKE ?)))';
    params.push(`${nq}%`, `% ${nq}%`, `${nq}%`, `% ${nq}%`);
  }
  params.push(opts.limit);
  const rows = await all<SuggestionDbRow>(
    db,
    `WITH base AS (
       SELECT id, COALESCE(brand_id, payee_key) AS gkey, brand_id, payee_key, counterparty_name, counterparty_type, category_id, transaction_at
       FROM transactions
       WHERE user_id = ? AND type = ? AND deleted_at IS NULL AND payee_key <> 'unknown'
     ), ranked AS (
       SELECT base.*,
              ROW_NUMBER() OVER (PARTITION BY gkey ORDER BY transaction_at DESC, id DESC) AS rn,
              COUNT(*) OVER (PARTITION BY gkey) AS n,
              SUM(CASE WHEN transaction_at >= ? THEN 2 ELSE 1 END) OVER (PARTITION BY gkey) AS score,
              FIRST_VALUE(category_id) OVER (PARTITION BY gkey ORDER BY category_id IS NULL, transaction_at DESC, id DESC) AS cat
       FROM base
     )
     SELECT r.brand_id, r.counterparty_name, r.payee_key, r.counterparty_type, r.cat AS category_id, r.n,
            r.transaction_at AS last_at, b.name AS brand_name, b.domain
     FROM ranked r LEFT JOIN brands b ON b.id = r.brand_id
     WHERE r.rn = 1 ${filter}
     ORDER BY r.score DESC, r.transaction_at DESC, r.gkey
     LIMIT ?`,
    params,
  );
  const meta = await fetchMetaByIds(
    db,
    [...new Set(rows.flatMap((r) => (r.category_id ? [r.category_id] : [])))],
    userId,
  );
  return {
    items: rows.map((r) => {
      const cat = r.category_id ? meta.get(r.category_id.toLowerCase()) : undefined;
      const category: CategoryRef | null = cat ? { id: cat.id, name: cat.name, icon_name: cat.icon_name ?? null, color: cat.color ?? null } : null;
      return {
        name: r.brand_name ?? (r.counterparty_name?.trim() || r.payee_key),
        brand_id: r.brand_id,
        domain: r.domain,
        counterparty_type: (COUNTERPARTY_TYPES.has(r.counterparty_type ?? '') ? r.counterparty_type : 'merchant') as PayeeSuggestion['counterparty_type'],
        category,
        count: r.n,
        last_at: isoUtc(r.last_at),
      };
    }),
  };
}
