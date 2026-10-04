import { log } from '../../core/logging';
import type { AgentMemory } from './memory';
import { parseTimeHint } from './range';
import type { DateRange } from './range';
import { AgentDbUnavailableError, executeToolCalls } from './sql-executor';
import type { SqlClient } from './sql-executor';
import { parseEntityMatches, resolveEntitiesCall } from './tools';
import type { EntityMatch } from './tools';

/**
 * The deterministic pre-pass (no LLM): a time hint from the question or the memory, fuzzy entity
 * resolution with pg_trgm (payees and categories mentioned in the question) and a clarification when a
 * name is genuinely ambiguous. Resolved entities are handed to the model so it can call the data tools
 * right away with exact ids.
 */

/** word_similarity below this is not a match at all. */
const MIN_SCORE = 0.5;
/** similarity at or above this means "the same name". */
const EXACT_SIMILARITY = 0.95;
/** Two candidates this close are ambiguous. */
const AMBIGUITY_GAP = 0.15;
const MAX_PHRASES = 6;

const STOPWORDS: ReadonlySet<string> = new Set(
  (
    'a an the and or but if then so as at by for from in into of on onto to up with without about over under per via ' +
    'is are was were be been being am do does did done doing have has had having can could would should will shall may might must ' +
    'i me my mine we our you your it its this that these those there here what which who whom whose when where why how ' +
    'much many more most less least some any all each every other another such only just also very too than not no yes ' +
    'show give tell list see get find check look display compare comparison versus vs ' +
    'spend spent spending spends expense expenses expenditure cost costs paid pay paying payment payments purchase purchases bought buy ' +
    'earn earned income received receive money amount amounts total totals sum average avg overall net cashflow balance savings saved save ' +
    'transaction transactions category categories payee payees merchant merchants budget budgets breakdown daily weekly monthly yearly day days week weeks month months year years ' +
    'today yesterday tomorrow now last past previous prior current next first second third biggest largest highest lowest smallest top bottom ' +
    'january february march april may june july august september october november december jan feb mar apr jun jul aug sep sept oct nov dec ' +
    'monday tuesday wednesday thursday friday saturday sunday mon tue tues wed thu thurs fri sat sun ' +
    'rupees rupee rs inr please thanks thank hi hello hey and also again same there them then ones one two three four five ' +
    'increase decrease change changed went go going gone higher lower bigger quarter half ' +
    'make made making share shared stay stayed single latest within above below between during enough order orders placed place ride rides trip trips ' +
    'subscription subscriptions note notes wrote write written different distinct weekday weekdays expensive cheapest cheap big small large little'
  ).split(/\s+/),
);

export interface ResolvedEntity {
  type: 'payee' | 'category';
  /** payee key, or category uuid. */
  id: string;
  name: string;
  exact: boolean;
}

export interface Ambiguity {
  phrase: string;
  options: ResolvedEntity[];
}

export interface PrePass {
  /** The question's own range, else the previous turn's. */
  range: (DateRange & { source: 'question' | 'memory' }) | null;
  entities: ResolvedEntity[];
  /** Set when the turn should end with this question instead of calling the model. */
  clarification: string | null;
  /** The entities the clarification offered (kept in the memory so the reply can resolve). */
  clarificationOptions: ResolvedEntity[];
}

/** Candidate entity phrases: runs of non-stopwords as bigrams and single words, longest first. */
export function extractPhrases(text: string): string[] {
  const tokens = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const phrases = new Set<string>();
  let run: string[] = [];
  const flush = () => {
    for (let i = 0; i < run.length - 1; i++) phrases.add(`${run[i]} ${run[i + 1]}`);
    for (const w of run) phrases.add(w);
    run = [];
  };
  for (const token of tokens) {
    if (token.length < 3 || /^\d+$/.test(token) || STOPWORDS.has(token)) flush();
    else run.push(token);
  }
  flush();
  return [...phrases].sort((a, b) => b.split(' ').length - a.split(' ').length || b.length - a.length).slice(0, MAX_PHRASES);
}

const words = (s: string): string[] => s.split(' ');
/** `inner` appears in `outer` as whole words. */
const containsWords = (outer: string, inner: string): boolean => ` ${outer} `.includes(` ${inner} `);

const toResolved = (m: EntityMatch, exact: boolean): ResolvedEntity => ({ type: m.type, id: m.id, name: m.name, exact });

/** Picks the entities the question refers to and the names that are ambiguous (see the thresholds above). */
export function selectEntities(matches: readonly EntityMatch[], phrases: readonly string[]): { entities: ResolvedEntity[]; ambiguities: Ambiguity[] } {
  const ordered = [...phrases].sort((a, b) => words(b).length - words(a).length || b.length - a.length);
  const entities = new Map<string, ResolvedEntity>();
  const ambiguities: Ambiguity[] = [];
  const consumed: string[] = [];

  for (const phrase of ordered) {
    if (consumed.some((c) => containsWords(c, phrase))) continue;
    const mine = matches.filter((m) => m.phrase === phrase && m.score >= MIN_SCORE);
    let used = false;
    for (const type of ['payee', 'category'] as const) {
      const list = mine.filter((m) => m.type === type).sort((a, b) => b.similarity - a.similarity || b.score - a.score);
      const best = list.find((m) => m.similarity >= EXACT_SIMILARITY) ?? [...list].sort((a, b) => b.score - a.score || b.similarity - a.similarity)[0];
      if (!best) continue;
      used = true;
      const exact = best.similarity >= EXACT_SIMILARITY;
      const rivals = exact ? [] : list.filter((m) => m.id !== best.id && best.score - m.score < AMBIGUITY_GAP);
      if (rivals.length > 0) {
        ambiguities.push({ phrase, options: [best, ...rivals].slice(0, 3).map((m) => toResolved(m, false)) });
      } else {
        entities.set(`${best.type}:${best.id}`, toResolved(best, exact));
      }
    }
    if (used) consumed.push(phrase);
  }
  return { entities: [...entities.values()], ambiguities };
}

export function clarificationText(a: Ambiguity): string {
  const names = a.options.map((o) => `**${o.name}**`);
  const joined = names.length === 2 ? `${names[0]} or ${names[1]}` : `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`;
  const kind = a.options[0]?.type === 'category' ? 'categories' : 'payees';
  return `Did you mean ${joined}? I found more than one of your ${kind} close to “${a.phrase}”.`;
}

export async function runPrepass(input: {
  text: string;
  tz: string;
  nowMs: number;
  userId: string;
  memory: AgentMemory | null;
  openSql: () => Promise<SqlClient>;
  timeoutMs: number;
}): Promise<PrePass> {
  const hint = parseTimeHint(input.text, input.tz, input.nowMs);
  const range: PrePass['range'] = hint
    ? { ...hint, source: 'question' }
    : input.memory?.time_range
      ? { ...input.memory.time_range, source: 'memory' }
      : null;

  const phrases = extractPhrases(input.text);
  if (phrases.length === 0) return { range, entities: [], clarification: null, clarificationOptions: [] };

  let matches: EntityMatch[] = [];
  try {
    const sql = await input.openSql();
    const { results } = await executeToolCalls(sql, input.userId, [resolveEntitiesCall(phrases)], { timeoutMs: input.timeoutMs });
    const first = results[0];
    if (first?.ok) matches = parseEntityMatches(first.value);
  } catch (err) {
    // An unreachable database must still fail the turn (the route answers 503); anything else only
    // costs the pre-resolved entities: the model can call resolve_entities itself.
    if (err instanceof AgentDbUnavailableError) throw err;
    log.warn('agent_prepass_failed', { err: String(err) });
  }

  const { entities, ambiguities } = selectEntities(matches, phrases);
  const ambiguity = ambiguities[0];
  return {
    range,
    entities,
    clarification: ambiguity ? clarificationText(ambiguity) : null,
    clarificationOptions: ambiguity ? ambiguity.options : [],
  };
}
