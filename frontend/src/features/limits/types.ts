export type LimitCounter = {
  used: number;
  limit: number;
  remaining: number;
};

/** `GET /api/v1/limits`: today's per-user allowances for the AI-backed actions. */
export type LimitsResponse = {
  /** ISO timestamp of the next reset. */
  resets_at: string;
  agent_questions: LimitCounter;
  receipt_scans: LimitCounter;
  voice_captures: LimitCounter;
  /** The server has paused receipt/voice capture for everyone (cost guard). */
  scanning_paused: boolean;
};
