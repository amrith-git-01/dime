/**
 * Failures of the AI pipeline (Groq OCR / Whisper, DeepSeek parse). They only ever surface in the
 * ingest consumer (never in an HTTP response), where `transient` decides between a queue retry and
 * a permanent job failure. Messages are generic on purpose: provider detail goes to the logs only (S9).
 */
export class AiError extends Error {
  readonly transient: boolean;

  constructor(message: string, transient: boolean, options?: { cause?: unknown }) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.transient = transient;
  }
}

/** Upstream was unreachable, timed out, rate limited or returned 5xx: retrying later may succeed. */
export class TransientAiError extends AiError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, true, options);
  }
}

/** Bad input, bad credentials or an unusable model answer: retrying the same job will not help. */
export class PermanentAiError extends AiError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, false, options);
  }
}
