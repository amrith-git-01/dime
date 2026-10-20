/**
 * Builds the brand catalogue (migration 0008: brands, brand_aliases, brands_fts) from open data and writes
 * scripts/brands/out/brands.sql to load with `wrangler d1 execute DB --file`.
 *
 *   npm run brands:build                       # fetch + write the SQL
 *   npx wrangler d1 execute DB --local  --file scripts/brands/out/brands.sql
 *   npx wrangler d1 execute DB --remote --file scripts/brands/out/brands.sql
 *
 * Sources (all storable):
 *   - Wikidata (CC0) through the QLever mirror: Indian companies, plus globally known consumer brands.
 *   - OpenStreetMap India (ODbL, credit "© OpenStreetMap contributors"): brand tags with their outlet counts, via
 *     Geofabrik's taginfo. Decides which global chains are actually present in India and ranks by real presence.
 *   - OSM Name Suggestion Index (BSD-3): clean names, spellings and shop types for those chains.
 *   - manual.json: hand-checked fixes, which win.
 * source column: 'wikidata', 'nsi' (anything from OpenStreetMap) or 'manual'.
 * Re-running is safe: brands are upserted, and a brand that dropped out is only deleted when no transaction points
 * at it.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeCounterparty } from '../../src/features/transactions/dedupe';

const HERE = dirname(fileURLToPath(import.meta.url));
const QLEVER = 'https://qlever.dev/api/wikidata';
const NSI = 'https://cdn.jsdelivr.net/npm/name-suggestion-index@latest/dist/nsi.min.json';
const TAGINFO = 'https://taginfo.geofabrik.de/asia:india/api/4';
/** An OSM brand tag with no Wikidata link needs this many outlets in India: fewer when the global NSI knows the
 *  name (a real chain), more when nothing vouches for it. */
const MIN_NSI_MATCHED_OUTLETS = 3;
const MIN_UNLINKED_OUTLETS = 10;
/** Global (non-Indian) Wikidata companies need this many Wikipedia articles to be "known" without Indian outlets. */
const MIN_GLOBAL_SITELINKS = 30;
/** OSM brand values that are facility types or generic words, not payees. */
const GENERIC_OSM =
  /^(anganwadi|ration shop|house|toddy shop|enterprise|akshaya|max|optical center|courtyard|post office|government|temple|school|hospital|atm|bank|petrol pump|medical|clinic|pharmacy|bus stop)$/;
const UA = 'DimeBrandCatalogue/1.0 (https://github.com/amrith-git-01/dime)';

/** Dime's system spend categories (migration 0001). */
const CATEGORY_IDS: Record<string, string> = {
  'Bills & Utilities': 'ad296c59-42ec-49e5-b824-c011c5b1b28b',
  Education: 'e7d18795-d02a-4350-9553-5573cc45aa28',
  Entertainment: '9a4d0ec2-15af-4162-ae1e-bc2b738ca33b',
  'Food & Dining': '85bf877a-f8b1-4b07-a9fb-5e8c809907ae',
  Health: 'a00eb2e0-48a8-47f1-98cb-3a30b8731501',
  Other: 'cec86c98-e09e-4a7a-afb0-05f66b17a94b',
  Shopping: 'a50ff903-ea00-404a-a3a4-d99c96899de5',
  Transport: '533e41b7-e8cf-42bc-95db-35b793b9f1f4',
  Travel: 'be46f4f5-efa9-4ad9-b09c-ca24a088e7f7',
};

/** Industry / instance-of label keywords -> category, checked in this order (first hit wins). */
const KEYWORD_CATEGORIES: [string, RegExp][] = [
  ['Food & Dining', /food|restaurant|fast food|beverage|coffee|caf[eé]|tea|dairy|bakery|grocer|confection|snack|pizza|quick commerce|supermarket/],
  ['Travel', /airline|hotel|touris|travel|hospitality|railway|aviation(?!.*aerospace)/],
  ['Transport', /taxi|ride|ridesharing|public transport|bus transport|fuel|filling station|petrol|automotive|motorcycle|car rental/],
  ['Bills & Utilities', /telecom|mobile network|mobile phone operator|internet service|electricity|electric utility|utility|broadband|satellite television|water supply|gas distribution|cable television/],
  ['Entertainment', /entertainment|streaming|film|cinema|music|video game|gaming|ott|broadcast|television|sport/],
  ['Health', /pharma|pharmacy|health|hospital|telemedicine|diagnostic|medical|fitness|wellness/],
  ['Education', /education|edtech|school|universit|coaching|e-learning|learning/],
  ['Shopping', /e-commerce|retail|clothing|fashion|cosmetic|jewel|consumer electronics|electronics|footwear|furniture|eyewear|apparel|shopping|marketplace|department store|toy|book/],
  ['Other', /bank|financial|fintech|insurance|payment|brokerage|investment/],
];

/** Purely business-to-business industries: a Wikidata company whose only industries are these is skipped. */
const B2B = /software|it service|information technology|consulting|aerospace|weapon|steel|chemical|mining|industrial|construction|biotech|space|computer security|artificial intelligence|survey|semiconductor|engineering|logistics|shipbuilding|cement|metallurg|machinery|power generation|oil and gas exploration|conglomerate|research|defen[cs]e/;

/** OSM tag path ("amenity/fast_food") -> category, for Name Suggestion Index items. */
function nsiCategory(path: string): string | null {
  const [, key, value] = path.split('/'); // "brands/amenity/fast_food"
  if (key === 'amenity') {
    if (/restaurant|fast_food|cafe|ice_cream|food_court|bar|pub/.test(value ?? '')) return 'Food & Dining';
    if (/fuel|charging_station|car_rental|parking/.test(value ?? '')) return 'Transport';
    if (/pharmacy|hospital|clinic|doctors|dentist/.test(value ?? '')) return 'Health';
    if (/bank|atm|bureau_de_change|money_transfer/.test(value ?? '')) return 'Other';
    if (/cinema|theatre/.test(value ?? '')) return 'Entertainment';
    if (/school|college|university|kindergarten/.test(value ?? '')) return 'Education';
    return null;
  }
  if (key === 'shop') {
    if (/supermarket|convenience|bakery|greengrocer|butcher|dairy|confectionery|beverages|tea|coffee|deli/.test(value ?? '')) return 'Food & Dining';
    if (/chemist|optician|medical/.test(value ?? '')) return /optician/.test(value ?? '') ? 'Shopping' : 'Health';
    if (/mobile_phone|telecommunication/.test(value ?? '')) return 'Bills & Utilities';
    if (/car|motorcycle|tyres|fuel/.test(value ?? '')) return 'Transport';
    return 'Shopping';
  }
  if (key === 'tourism') return 'Travel';
  if (key === 'leisure') return /fitness|sports/.test(value ?? '') ? 'Health' : 'Entertainment';
  if (key === 'healthcare') return 'Health';
  return null;
}

interface Brand {
  id: string;
  name: string;
  domain: string | null;
  category: string | null;
  country: string | null;
  /** Wikipedia articles about it (Wikidata sitelinks): how known it is. */
  sitelinks: number;
  /** Outlets mapped in India on OpenStreetMap: how present it is here. */
  outlets: number;
  manual: boolean;
  source: 'wikidata' | 'nsi' | 'manual';
  wikidataId: string | null;
  aliases: Set<string>;
}

function categoryFromLabels(labels: string[]): string | null {
  const text = labels.join(' | ').toLowerCase();
  for (const [category, pattern] of KEYWORD_CATEGORIES) if (pattern.test(text)) return category;
  return null;
}

/** "https://www.swiggy.com/en/" -> "swiggy.com"; picks the shortest host among several websites. */
function bestDomain(sites: string[]): string | null {
  const hosts = sites
    .map((s) => {
      try {
        return new URL(s).hostname.toLowerCase().replace(/^www\d?\./, '');
      } catch {
        return null;
      }
    })
    .filter((h): h is string => !!h);
  hosts.sort((a, b) => a.length - b.length);
  return hosts[0] ?? null;
}

/** fetch with retries: these public endpoints rate-limit bursts (429), hiccup (5xx) and sometimes drop connections. */
async function fetchRetry(url: string, init: RequestInit, waitMs: number): Promise<Response> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const res = await fetch(url, init);
      if ((res.status !== 429 && res.status < 500) || attempt === 5) return res;
    } catch (err) {
      if (attempt === 5) throw err;
    }
    await new Promise((r) => setTimeout(r, waitMs * attempt));
  }
}

async function sparql(query: string): Promise<Record<string, string>[]> {
  const res = await fetchRetry(
    QLEVER,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/sparql-results+json', 'User-Agent': UA },
      body: new URLSearchParams({ query }),
    },
    15_000,
  );
  if (!res.ok) throw new Error(`SPARQL ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json<{ results: { bindings: Record<string, { value: string }>[] } }>();
  return json.results.bindings.map((b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value])));
}

const PREFIXES = `PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>`;

/** Consumer-facing company classes: business, company, public company, brand, enterprise, website, retail chain,
 *  restaurant chain, airline, bank, supermarket chain, telecom company, mobile network operator, online shop. */
const CLASSES = 'wd:Q4830453 wd:Q783794 wd:Q891723 wd:Q431289 wd:Q6881511 wd:Q35127 wd:Q507619 wd:Q18534524 wd:Q46970 wd:Q22687 wd:Q18043413 wd:Q2401749 wd:Q1941618 wd:Q4382945';

function brandQuery(where: string): string {
  return `${PREFIXES}
SELECT ?item ?label ?sl (GROUP_CONCAT(DISTINCT STR(?site); SEPARATOR="\\t") AS ?sites)
  (GROUP_CONCAT(DISTINCT ?tag; SEPARATOR="\\t") AS ?tags) (GROUP_CONCAT(DISTINCT ?alt; SEPARATOR="\\t") AS ?alts) WHERE {
  ${where}
  ?item rdfs:label ?label . FILTER(LANG(?label) = "en")
  OPTIONAL { ?item wdt:P856 ?site }
  OPTIONAL { ?item wikibase:sitelinks ?sl }
  OPTIONAL { { ?item wdt:P452 ?t } UNION { ?item wdt:P31 ?t } ?t rdfs:label ?tag . FILTER(LANG(?tag) = "en") }
  OPTIONAL { ?item skos:altLabel ?alt . FILTER(LANG(?alt) = "en") }
}
GROUP BY ?item ?label ?sl`;
}

function addAlias(brand: Brand, raw: string): void {
  const alias = normalizeCounterparty(raw);
  if (alias.length >= 2) brand.aliases.add(alias);
}

function fromWikidataRow(row: Record<string, string>, country: string | null, source: Brand['source']): Brand | null {
  const qid = row.item?.split('/').pop();
  if (!qid || !row.label) return null;
  const tags = (row.tags ?? '').split('\t').filter(Boolean);
  const category = categoryFromLabels(tags);
  const lowerTags = tags.map((t) => t.toLowerCase());
  const generic = /^(business|company|enterprise|public company|brand|website|organization|private company|subsidiary)$/;
  const specific = lowerTags.filter((t) => !generic.test(t));
  if (!category && specific.length > 0 && specific.every((t) => B2B.test(t))) return null;
  // Obscure entries (no Wikipedia article in any language, no consumer category) are noise in a search box.
  if (!category && !(Number(row.sl ?? 0) > 0)) return null;
  const brand: Brand = {
    id: `wd:${qid}`,
    name: row.label,
    domain: bestDomain((row.sites ?? '').split('\t').filter(Boolean)),
    category,
    country,
    sitelinks: Number(row.sl ?? 0) || 0,
    outlets: 0,
    manual: false,
    source,
    wikidataId: qid,
    aliases: new Set(),
  };
  addAlias(brand, row.label);
  for (const alt of (row.alts ?? '').split('\t')) if (alt && alt.length <= 60) addAlias(brand, alt);
  return brand;
}

async function wikidataIndia(): Promise<Brand[]> {
  const rows = await sparql(brandQuery(`VALUES ?cls { ${CLASSES} } ?item wdt:P31 ?cls ; wdt:P17 wd:Q668 ; wdt:P856 ?anySite .`));
  return rows.map((r) => fromWikidataRow(r, 'IN', 'wikidata')).filter((b): b is Brand => !!b && !!b.domain);
}

/** Globally known consumer companies (streaming, apparel, electronics, airlines…) that Indians pay too. */
async function wikidataGlobal(): Promise<Brand[]> {
  const rows = await sparql(
    brandQuery(
      `VALUES ?cls { ${CLASSES} } ?item wdt:P31 ?cls ; wdt:P856 ?anySite ; wikibase:sitelinks ?slc .
  BIND(xsd:integer(STR(?slc)) AS ?sln) FILTER(?sln >= ${MIN_GLOBAL_SITELINKS})`,
    ),
  );
  // Consumer brands only: without a category it is a bank abroad, an oil major, a holding company…
  return rows.map((r) => fromWikidataRow(r, null, 'wikidata')).filter((b): b is Brand => !!b?.domain && !!b.category);
}

async function wikidataByIds(qids: string[]): Promise<Map<string, Brand>> {
  const out = new Map<string, Brand>();
  for (let i = 0; i < qids.length; i += 200) {
    const values = qids.slice(i, i + 200).map((q) => `wd:${q}`).join(' ');
    const rows = await sparql(brandQuery(`VALUES ?item { ${values} }`));
    for (const r of rows) {
      const b = fromWikidataRow(r, null, 'nsi');
      if (b) out.set(b.wikidataId!, b);
    }
  }
  return out;
}

interface NsiItem {
  id: string;
  displayName: string;
  locationSet?: { include?: (string | number[])[] };
  matchNames?: string[];
  tags?: Record<string, string>;
}

interface NsiEntry {
  path: string;
  item: NsiItem;
}

/** NSI brands: those scoped to India, and an index of every brand by Wikidata id (for chains present in India). */
async function loadNsi(): Promise<{ india: NsiEntry[]; byQid: Map<string, NsiEntry>; byName: Map<string, NsiEntry> }> {
  const res = await fetchRetry(NSI, { headers: { 'User-Agent': UA } }, 5_000);
  if (!res.ok) throw new Error(`NSI ${res.status}`);
  const json = await res.json<{ nsi: Record<string, { items?: NsiItem[] }> }>();
  const india: NsiEntry[] = [];
  const byQid = new Map<string, NsiEntry>();
  const byName = new Map<string, NsiEntry>(); // normalised display name / spelling -> entry (first wins)
  for (const [path, value] of Object.entries(json.nsi)) {
    if (!path.startsWith('brands/')) continue;
    for (const item of value.items ?? []) {
      const include = (item.locationSet?.include ?? []).map((x) => String(x).toLowerCase());
      if (include.includes('in')) india.push({ path, item });
      const qid = item.tags?.['brand:wikidata'];
      if (qid && !byQid.has(qid)) byQid.set(qid, { path, item });
      for (const name of [item.displayName, item.tags?.brand, ...(item.matchNames ?? [])]) {
        const key = name ? normalizeCounterparty(name) : '';
        if (key.length >= 3 && !byName.has(key)) byName.set(key, { path, item });
      }
    }
  }
  return { india, byQid, byName };
}

async function taginfo<T>(path: string): Promise<T> {
  const res = await fetchRetry(`${TAGINFO}${path}`, { headers: { 'User-Agent': UA } }, 5_000);
  if (!res.ok) throw new Error(`taginfo ${res.status} ${path}`);
  return res.json<T>();
}

/** Every value of an OSM key in India with its object count, most common first. */
async function osmIndiaValues(key: string): Promise<{ value: string; count: number }[]> {
  const out: { value: string; count: number }[] = [];
  for (let page = 1; ; page += 1) {
    const json = await taginfo<{ data: { value: string; count: number }[] }>(
      `/key/values?key=${encodeURIComponent(key)}&sortname=count&sortorder=desc&rp=999&page=${page}`,
    );
    out.push(...json.data);
    if (json.data.length < 999) return out;
  }
}

/** What kind of place an OSM brand is in India ("brands/amenity/fuel"), from the tags it is used with. */
async function osmFeaturePath(brandValue: string): Promise<string | null> {
  const json = await taginfo<{ data: { other_key: string; other_value: string }[] }>(
    `/tag/combinations?key=brand&value=${encodeURIComponent(brandValue)}&sortname=together_count&sortorder=desc&rp=30&page=1`,
  );
  const hit = json.data.find((d) => d.other_value && /^(amenity|shop|tourism|leisure|healthcare)$/.test(d.other_key));
  return hit ? `brands/${hit.other_key}/${hit.other_value}` : null;
}

async function main(): Promise<void> {
  const brands = new Map<string, Brand>();
  const put = (b: Brand) => {
    const existing = brands.get(b.id);
    if (!existing) return void brands.set(b.id, b);
    for (const a of b.aliases) existing.aliases.add(a);
    existing.category ??= b.category;
    existing.domain ??= b.domain;
  };

  const india = await wikidataIndia();
  india.forEach(put);
  console.log(`wikidata, Indian companies: ${india.length}`);

  const global = await wikidataGlobal();
  global.forEach(put);
  console.log(`wikidata, global consumer brands: ${global.length}`);

  // OpenStreetMap India: which brands have outlets here, and how many.
  const [osmQids, osmNames, nsi] = await Promise.all([osmIndiaValues('brand:wikidata'), osmIndiaValues('brand'), loadNsi()]);
  const outletsByQid = new Map(osmQids.filter((v) => /^Q\d+$/.test(v.value)).map((v) => [v.value, v.count]));
  const missing = [...new Set([...outletsByQid.keys(), ...nsi.india.map((n) => n.item.tags?.['brand:wikidata'] ?? '')])].filter(
    (qid) => /^Q\d+$/.test(qid) && !brands.has(`wd:${qid}`),
  );
  const fetched = await wikidataByIds(missing);

  /** The catalogue's own record for a Wikidata id (edited in place), or a fresh copy of a fetched one. */
  const live = (qid: string): Brand | undefined => {
    const own = brands.get(`wd:${qid}`);
    if (own) return own;
    const f = fetched.get(qid);
    return f ? { ...f, aliases: new Set(f.aliases) } : undefined;
  };

  const withNsi = (brand: Brand, entry: NsiEntry | undefined): Brand => {
    if (!entry) return brand;
    // NSI holds the name on the shop sign ("Bata", "Levi's"); Wikidata the legal one ("Bata Limited").
    if (!brand.manual) {
      addAlias(brand, brand.name);
      brand.name = entry.item.displayName;
    }
    brand.category ??= nsiCategory(entry.path);
    addAlias(brand, entry.item.displayName);
    if (entry.item.tags?.brand) addAlias(brand, entry.item.tags.brand);
    for (const m of entry.item.matchNames ?? []) addAlias(brand, m);
    return brand;
  };

  // Chains present in India (OSM outlets with a Wikidata link), global ones included.
  for (const [qid, outlets] of outletsByQid) {
    const brand = live(qid);
    if (!brand) continue;
    withNsi(brand, nsi.byQid.get(qid));
    brand.outlets = Math.max(brand.outlets, outlets);
    if (brand.category) put(brand);
  }

  // NSI entries scoped to India (some have no outlets mapped yet).
  for (const entry of nsi.india) {
    const qid = entry.item.tags?.['brand:wikidata'];
    const base = qid ? live(qid) : undefined;
    if (base) base.country = 'IN';
    const brand: Brand = base
      ?? { id: `nsi:${entry.item.id}`, name: entry.item.displayName, domain: null, category: null, country: 'IN', sitelinks: 0, outlets: 0, manual: false, source: 'nsi', wikidataId: null, aliases: new Set() };
    put(withNsi(brand, entry));
  }

  // OSM brand names: add outlet counts to brands we already know, and take well-established unlinked chains.
  const byAlias = new Map<string, Brand>();
  for (const b of brands.values()) for (const a of b.aliases) if (!byAlias.has(a)) byAlias.set(a, b);
  const unlinked: { value: string; count: number }[] = [];
  for (const { value, count } of osmNames) {
    const key = normalizeCounterparty(value);
    const known = byAlias.get(key);
    if (known) known.outlets = Math.max(known.outlets, count);
    else if (count >= MIN_NSI_MATCHED_OUTLETS && key.length >= 3 && !GENERIC_OSM.test(key)) unlinked.push({ value, count });
  }
  // Indian OSM objects often carry only brand=Bata without brand:wikidata: find the chain in the global NSI by name.
  const nsiMatches = unlinked.map((u) => ({ ...u, entry: nsi.byName.get(normalizeCounterparty(u.value)) }));
  const matchedQids = [...new Set(nsiMatches.map((m) => m.entry?.item.tags?.['brand:wikidata'] ?? ''))].filter(
    (qid) => /^Q\d+$/.test(qid) && !brands.has(`wd:${qid}`) && !fetched.has(qid),
  );
  for (const [qid, b] of await wikidataByIds(matchedQids)) fetched.set(qid, b);
  let kept = 0;
  for (const { value, count, entry } of nsiMatches) {
    const qid = entry?.item.tags?.['brand:wikidata'];
    const base = qid ? live(qid) : undefined;
    let brand: Brand;
    if (base) {
      brand = withNsi(base, entry);
    } else {
      if (!entry && count < MIN_UNLINKED_OUTLETS) continue;
      const path = entry?.path ?? (await osmFeaturePath(value));
      const category = path ? nsiCategory(path) : null;
      if (!category) continue; // not a place people pay: an office, a power line operator…
      brand = { id: `osm:${normalizeCounterparty(value).replace(/ /g, '-')}`, name: entry?.item.displayName ?? value, domain: null, category, country: 'IN', sitelinks: 0, outlets: 0, manual: false, source: 'nsi', wikidataId: null, aliases: new Set() };
    }
    addAlias(brand, value);
    brand.outlets = Math.max(brand.outlets, count);
    if (!brand.category) continue;
    put(brand);
    kept += 1;
  }
  console.log(`openstreetmap india: ${outletsByQid.size} linked brands, ${kept} of ${unlinked.length} unlinked chains kept; nsi india: ${nsi.india.length}`);

  const manual = JSON.parse(readFileSync(join(HERE, 'manual.json'), 'utf8')) as {
    brands: { slug: string; wikidata?: string; name: string; domain?: string; category?: string; aliases?: string[] }[];
  };
  for (const m of manual.brands) {
    if (m.category && !CATEGORY_IDS[m.category]) throw new Error(`manual.json: unknown category "${m.category}" for ${m.slug}`);
    // Without a Wikidata id, take over the existing record that already has one of the entry's spellings
    // (most popular first), so a hand-checked brand never shows up twice.
    const spellings = [m.name, ...(m.aliases ?? [])].map(normalizeCounterparty);
    const adopted = m.wikidata
      ? undefined
      : [...brands.values()]
          .filter((b) => !b.manual && spellings.some((sp) => b.aliases.has(sp)))
          .sort((a, b) => popularity(b) - popularity(a))[0];
    const id = m.wikidata ? `wd:${m.wikidata}` : (adopted?.id ?? `dime:${m.slug}`);
    const prev = brands.get(id);
    const brand: Brand = {
      id,
      name: m.name,
      domain: m.domain ?? prev?.domain ?? null,
      category: m.category ?? prev?.category ?? null,
      country: prev?.country ?? 'IN',
      sitelinks: prev?.sitelinks ?? 0,
      outlets: prev?.outlets ?? 0,
      manual: true,
      source: 'manual',
      wikidataId: m.wikidata ?? prev?.wikidataId ?? null,
      aliases: new Set(prev?.aliases ?? []),
    };
    addAlias(brand, m.name);
    addAlias(brand, m.slug.replace(/-/g, ' '));
    for (const a of m.aliases ?? []) addAlias(brand, a);
    brands.set(id, brand);
  }
  console.log(`manual: ${manual.brands.length}`);

  // Foreign brands with no Indian presence: keep the ones Indians can pay online, and household names.
  for (const b of [...brands.values()]) {
    if (isForeignOnly(b) && !(b.category && ONLINE_CATEGORIES.has(b.category)) && b.sitelinks < VERY_FAMOUS_SITELINKS) brands.delete(b.id);
  }

  // Same website = same brand (a manual entry and its Wikidata row, or two Wikidata items for one company):
  // keep the most popular one (manual first), give it the others' spellings and fill gaps from them.
  const byDomain = new Map<string, Brand>();
  for (const b of [...brands.values()].sort((a, b) => popularity(b) - popularity(a))) {
    if (!b.domain) continue;
    const keeper = byDomain.get(b.domain);
    if (!keeper) {
      byDomain.set(b.domain, b);
      continue;
    }
    for (const a of b.aliases) keeper.aliases.add(a);
    keeper.category ??= b.category;
    keeper.wikidataId ??= b.wikidataId;
    keeper.outlets = Math.max(keeper.outlets, b.outlets);
    keeper.sitelinks = Math.max(keeper.sitelinks, b.sitelinks);
    brands.delete(b.id);
  }

  // One alias -> one brand: the more popular (manual first) keeps a shared spelling.
  const ranked = [...brands.values()].sort((a, b) => popularity(b) - popularity(a));
  const aliasOwner = new Map<string, string>();
  for (const b of ranked) for (const a of b.aliases) if (!aliasOwner.has(a)) aliasOwner.set(a, b.id);

  writeSql(ranked, aliasOwner);
}

/**
 * Search ranking: presence in India counts most (a fuel chain with 4,000 outlets), fame helps but is capped so a
 * world-famous brand with no Indian outlets does not outrank Indian ones, and hand-picked brands come first.
 */
function popularity(b: Brand): number {
  const fame = Math.min(b.sitelinks, 40) / (isForeignOnly(b) ? 2 : 1);
  return Math.round(fame + 15 * Math.log10(1 + b.outlets)) + (b.manual ? 100 : 0);
}

/** A non-Indian brand with no outlets mapped in India: only reachable online, if at all. */
function isForeignOnly(b: Brand): boolean {
  return !b.manual && b.country !== 'IN' && b.outlets === 0;
}

/** Categories people pay online from India (streaming, flights, courses); a foreign supermarket or bank is noise. */
const ONLINE_CATEGORIES = new Set(['Entertainment', 'Travel', 'Education']);
const VERY_FAMOUS_SITELINKS = 80;

function q(v: string | number | null): string {
  if (v === null) return 'NULL';
  if (typeof v === 'number') return String(v);
  return `'${v.replace(/'/g, "''")}'`;
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function writeSql(brands: Brand[], aliasOwner: Map<string, string>): void {
  const runAt = new Date().toISOString();
  const lines: string[] = [`-- Generated by scripts/brands/build.ts at ${runAt}. Do not edit; edit manual.json and re-run.`];
  for (const part of chunks(brands, 50)) {
    const rows = part.map((b) =>
      `(${[b.id, b.name, b.domain, null, b.category ? CATEGORY_IDS[b.category]! : null, b.country, popularity(b), b.source, b.wikidataId, runAt].map(q).join(', ')})`,
    );
    lines.push(
      `INSERT INTO brands (id, name, domain, logo_url, category_id, country, popularity, source, wikidata_id, updated_at) VALUES\n${rows.join(',\n')}\n` +
        `ON CONFLICT (id) DO UPDATE SET name = excluded.name, domain = excluded.domain, category_id = excluded.category_id, country = excluded.country, popularity = excluded.popularity, source = excluded.source, wikidata_id = excluded.wikidata_id, updated_at = excluded.updated_at;`,
    );
  }
  // Brands that dropped out of every source: delete unless a transaction still points at them.
  lines.push(`DELETE FROM brands WHERE updated_at < ${q(runAt)} AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.brand_id = brands.id);`);

  lines.push('DELETE FROM brand_aliases;');
  for (const part of chunks([...aliasOwner.entries()], 200)) {
    lines.push(`INSERT INTO brand_aliases (alias, brand_id) VALUES\n${part.map(([a, id]) => `(${q(a)}, ${q(id)})`).join(',\n')};`);
  }

  // Link existing history: rows whose payee key is a known alias (people and own-account transfers stay unlinked).
  lines.push(
    'UPDATE transactions SET brand_id = (SELECT a.brand_id FROM brand_aliases a WHERE a.alias = transactions.payee_key) ' +
      "WHERE brand_id IS NULL AND deleted_at IS NULL AND COALESCE(counterparty_type, 'merchant') NOT IN ('person', 'self_transfer');",
  );

  lines.push('DELETE FROM brands_fts;');
  for (const part of chunks(brands, 100)) {
    const rows = part.map((b) => {
      const aliases = [...b.aliases].filter((a) => aliasOwner.get(a) === b.id && a !== normalizeCounterparty(b.name)).join(' ');
      return `(${q(b.id)}, ${q(b.name)}, ${q(aliases)})`;
    });
    lines.push(`INSERT INTO brands_fts (brand_id, name, aliases) VALUES\n${rows.join(',\n')};`);
  }

  const outFile = join(HERE, 'out', 'brands.sql');
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, `${lines.join('\n')}\n`);
  const withCategory = brands.filter((b) => b.category).length;
  console.log(`wrote ${outFile}: ${brands.length} brands (${withCategory} with a category), ${aliasOwner.size} aliases`);
}

await main();
