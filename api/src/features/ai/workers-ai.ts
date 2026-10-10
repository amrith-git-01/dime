import { Buffer } from 'node:buffer';

import type { AppConfig } from '../../core/env';
import { log } from '../../core/logging';
import { PermanentAiError, TransientAiError } from './errors';
import { neuronsFromAudioSeconds, estimateOcrNeurons, estimateWhisperNeurons, neuronsFromTokens, OCR_MAX_OUTPUT_TOKENS } from './neuron-cap';
import { buildReceiptOcrPrompt } from './prompts';

const OCR_MIN_TIMEOUT_MS = 45_000;
const WHISPER_MIN_TIMEOUT_MS = 60_000;

/** The one method of the `AI` binding used here (tests pass a fake). */
export type AiBinding = Pick<Ai, 'run'>;

/** Everything a Workers AI call needs: the binding, the models, the timeout and where to book the neurons. */
export interface WorkersAiClient {
  binding: AiBinding | undefined;
  config: AppConfig['workersAi'];
  timeoutMs: number;
  /** Called with the neurons a SUCCESSFUL call used (actual when the response says, else the estimate). Must not throw. */
  recordNeurons?: (neurons: number) => Promise<void>;
}

/** The receipt photo as bytes (read from R2); the model only accepts a base64 data URL. */
export interface ReceiptImage {
  bytes: Uint8Array;
  mimeType: string;
}

const dataUrl = (image: ReceiptImage): string => {
  const mime = image.mimeType.startsWith('image/') ? image.mimeType : 'image/jpeg';
  return `data:${mime};base64,${Buffer.from(image.bytes).toString('base64')}`;
};

/** Failures that retrying later can fix: capacity (3040), timeouts, the free allowance (3036), 429/5xx, network. */
const TRANSIENT_PATTERN = /\b(3040|3036|3007|3043|429|5\d\d)\b|capacity|timed? ?out|timeout|overloaded|rate limit|temporar|unavailable|fetch failed|network|daily free allocation|ECONN/i;
/** Failures of the input itself: the same job will fail the same way. */
const PERMANENT_PATTERN = /invalid|bad request|unsupported|not supported|too large|exceed|\b(400|413|415|422)\b/i;

/**
 * Workers AI throws plain `Error`s whose message starts with the error code; an aborted call is an
 * `AbortError`/`TimeoutError`. Transient checks first (so "capacity exceeded" retries), then bad input, and
 * anything unknown retries (the queue allows 3 attempts, so a bad guess costs little).
 */
export function mapWorkersAiError(err: unknown, upstream: string): TransientAiError | PermanentAiError {
  if (err instanceof TransientAiError || err instanceof PermanentAiError) return err;
  const name = err instanceof Error ? err.name : '';
  const message = err instanceof Error ? err.message : String(err);
  log.warn('ai_upstream_error', { upstream, name, message: message.slice(0, 500) });
  if (name === 'AbortError' || name === 'TimeoutError') return new TransientAiError(`${upstream} timed out.`, { cause: err });
  if (TRANSIENT_PATTERN.test(message)) return new TransientAiError(`${upstream} request failed.`, { cause: err });
  if (PERMANENT_PATTERN.test(message)) return new PermanentAiError(`${upstream} rejected the input.`, { cause: err });
  return new TransientAiError(`${upstream} request failed.`, { cause: err });
}

async function run(client: WorkersAiClient, upstream: string, model: string, inputs: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
  if (!client.binding) throw new PermanentAiError('The AI binding is missing.');
  if (!model) throw new PermanentAiError(`${upstream} model is not configured.`);
  const options: AiOptions = { signal: AbortSignal.timeout(timeoutMs) };
  if (client.config.gatewayId) options.gateway = { id: client.config.gatewayId };
  try {
    return await client.binding.run(model, inputs, options);
  } catch (err) {
    throw mapWorkersAiError(err, upstream);
  }
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

function responseText(data: unknown): string {
  if (typeof data === 'string') return data.trim();
  const d = data as { response?: unknown; choices?: { message?: { content?: unknown } }[] } | null;
  const content = typeof d?.response === 'string' ? d.response : d?.choices?.[0]?.message?.content;
  if (Array.isArray(content)) {
    return content
      .map((part: unknown) => (typeof (part as { text?: unknown } | null)?.text === 'string' ? (part as { text: string }).text : ''))
      .join('')
      .trim();
  }
  return typeof content === 'string' ? content.trim() : '';
}

/** Workers AI vision (Llama 4 Scout): receipt image to plain OCR text. */
export async function extractReceiptText(client: WorkersAiClient, image: ReceiptImage): Promise<string> {
  const started = Date.now();
  const data = await run(
    client,
    'workers-ai-ocr',
    client.config.visionModel,
    {
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: buildReceiptOcrPrompt() },
            { type: 'image_url', image_url: { url: dataUrl(image) } },
          ],
        },
      ],
      temperature: 0,
      max_tokens: OCR_MAX_OUTPUT_TOKENS,
    },
    Math.max(client.timeoutMs, OCR_MIN_TIMEOUT_MS),
  );

  const text = responseText(data);
  if (!text) throw new PermanentAiError('Receipt OCR returned empty text.');
  const usage = (data as { usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } } | null)?.usage;
  const prompt = num(usage?.prompt_tokens);
  const completion = num(usage?.completion_tokens);
  const neurons = prompt !== undefined && completion !== undefined ? neuronsFromTokens(prompt, completion) : estimateOcrNeurons();
  await client.recordNeurons?.(neurons);
  log.info('ocr_done', { model: client.config.visionModel, elapsedMs: Date.now() - started, chars: text.length, neurons });
  return text;
}

/**
 * Workers AI Whisper. The recorded audio is sent as-is, base64 (no ffmpeg on Workers; the app records m4a).
 * `mimeType` is not part of the input (the model sniffs the container); it is kept for the log.
 */
export async function transcribeAudio(client: WorkersAiClient, audio: Uint8Array, mimeType: string): Promise<string> {
  const started = Date.now();
  const data = await run(
    client,
    'workers-ai-whisper',
    client.config.whisperModel,
    { audio: Buffer.from(audio).toString('base64') },
    Math.max(client.timeoutMs, WHISPER_MIN_TIMEOUT_MS),
  );
  const text = (data as { text?: unknown } | null)?.text;
  if (typeof text !== 'string' || !text.trim()) throw new PermanentAiError('Whisper returned an empty transcript.');
  const seconds = num((data as { transcription_info?: { duration?: unknown } } | null)?.transcription_info?.duration);
  const neurons = seconds !== undefined && seconds > 0 ? neuronsFromAudioSeconds(seconds) : estimateWhisperNeurons(audio.byteLength);
  await client.recordNeurons?.(neurons);
  log.info('whisper_done', { model: client.config.whisperModel, mimeType, elapsedMs: Date.now() - started, chars: text.trim().length, neurons });
  return text.trim();
}
