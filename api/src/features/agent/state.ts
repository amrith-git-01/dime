import type { DeepLink, MiniChartBlock } from './schemas';
import type { SqlCell } from './sql-guard';

/** What one agent turn learns; the blocks, the deep link, the numeric check and the memory are built from it, never from model text. */

/** A successful run_sql result, kept for charts, the numeric check and the fallback answer. */
export interface SqlRun {
  id: string;
  columns: string[];
  rows: SqlCell[][];
  /** How many leading rows the model was shown (the numeric check only trusts those). */
  shown: number;
  truncated: boolean;
}

export interface TurnState {
  /** run_sql calls started (result ids are r1, r2, ... in call order). */
  sqlCalls: number;
  runs: SqlRun[];
  /** Entities the model found or linked (memory). */
  entities: { type: 'payee' | 'category'; id: string; name: string }[];
  chart: MiniChartBlock | null;
  /** The last valid deep link, and the range it covers. */
  link: DeepLink | null;
  linkRange: { from: string; to: string } | null;
}

export const newTurnState = (): TurnState => ({ sqlCalls: 0, runs: [], entities: [], chart: null, link: null, linkRange: null });
