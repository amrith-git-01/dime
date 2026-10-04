import { Buffer } from 'node:buffer';

import type { AppConfig } from '../../core/env';
import { log } from '../../core/logging';
import { PermanentAiError } from './errors';
import { aggregateFailure, aiPost } from './http';
import { buildReceiptOcrPrompt } from './prompts';

const OCR_MIN_TIMEOUT_MS = 45_000;
const WHISPER_MIN_TIMEOUT_MS = 60_000;

function requireKey(config: AppConfig['groq']): string {
  if (!config.apiKey) throw new PermanentAiError('GROQ_API_KEY is missing');
  return config.apiKey;
}

/**
 * What Groq vision is shown. Preferred: a short-lived https signed URL of the private Storage object
 * (Groq fetches it itself; the request may be up to 20 MB and none of those bytes pass through the
 * Worker). Fallback: the bytes as a base64 data URL, which Groq limits to 4 MB.
 */
export type ReceiptImage = { url: string } | { bytes: Uint8Array; mimeType: string };

function imageUrlOf(image: ReceiptImage): string {
  if ('url' in image) return image.url;
  const mime = image.mimeType.startsWith('image/') ? image.mimeType : 'image/jpeg';
  return `data:${mime};base64,${Buffer.from(image.bytes).toString('base64')}`;
}

/** Groq vision (Llama 4 Scout): receipt image to plain OCR text. */
export async function extractReceiptText(
  groq: AppConfig['groq'],
  ai: Pick<AppConfig['ai'], 'timeoutMs'>,
  image: ReceiptImage,
): Promise<string> {
  const model = groq.visionOcrModel.trim();
  if (!model) throw new PermanentAiError('GROQ_VISION_OCR_MODEL is not configured');
  const apiKey = requireKey(groq);
  const started = Date.now();

  const data = await aiPost(`${groq.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    upstream: 'groq-ocr',
    timeoutMs: Math.max(ai.timeoutMs, OCR_MIN_TIMEOUT_MS),
    headers: { authorization: `Bearer ${apiKey}` },
    json: {
      model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: buildReceiptOcrPrompt() },
            { type: 'image_url', image_url: { url: imageUrlOf(image) } },
          ],
        },
      ],
      temperature: 0,
      max_tokens: 2048,
    },
  });

  const content = (data as { choices?: { message?: { content?: unknown } }[] } | null)?.choices?.[0]?.message?.content;
  let text = '';
  if (Array.isArray(content)) {
    text = content
      .map((part: unknown) => (typeof part === 'object' && part !== null && typeof (part as { text?: unknown }).text === 'string' ? (part as { text: string }).text : ''))
      .join('')
      .trim();
  } else if (typeof content === 'string') {
    text = content.trim();
  }
  if (!text) throw new PermanentAiError('Receipt OCR returned empty text.');
  log.info('ocr_done', { model, via: 'url' in image ? 'signed_url' : 'base64', elapsedMs: Date.now() - started, chars: text.length });
  return text;
}

const AUDIO_EXTENSION: Record<string, string> = {
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/aac': 'aac',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
};

async function transcribeWithModel(
  groq: AppConfig['groq'],
  model: string,
  audio: Uint8Array,
  mimeType: string,
  timeoutMs: number,
): Promise<string> {
  const form = new FormData();
  form.set('model', model);
  form.set('file', new Blob([audio], { type: mimeType }), `audio.${AUDIO_EXTENSION[mimeType] ?? 'm4a'}`);
  const data = await aiPost(`${groq.baseUrl.replace(/\/+$/, '')}/audio/transcriptions`, {
    upstream: 'groq-whisper',
    timeoutMs,
    headers: { authorization: `Bearer ${requireKey(groq)}` },
    body: form,
  });
  const text = (data as { text?: unknown } | null)?.text;
  if (typeof text !== 'string' || !text.trim()) throw new PermanentAiError('Whisper returned an empty transcript.');
  return text.trim();
}

/**
 * Groq Whisper: the primary model, then the fallback model. The recorded audio is sent as-is (no
 * ffmpeg on Workers; the app records m4a). Transient if any model failed in a retryable way.
 */
export async function transcribeAudio(
  groq: AppConfig['groq'],
  ai: Pick<AppConfig['ai'], 'timeoutMs'>,
  audio: Uint8Array,
  mimeType: string,
): Promise<string> {
  requireKey(groq);
  const models = [groq.whisperPrimary, groq.whisperFallback].map((m) => m.trim()).filter(Boolean);
  if (models.length === 0) throw new PermanentAiError('No Whisper models configured');
  const timeoutMs = Math.max(ai.timeoutMs, WHISPER_MIN_TIMEOUT_MS);
  const errors: unknown[] = [];
  for (const model of models) {
    const started = Date.now();
    try {
      const text = await transcribeWithModel(groq, model, audio, mimeType, timeoutMs);
      log.info('whisper_done', { model, elapsedMs: Date.now() - started, chars: text.length });
      return text;
    } catch (err) {
      log.warn('whisper_failed', { model, elapsedMs: Date.now() - started, err: String(err) });
      errors.push(err);
    }
  }
  throw aggregateFailure('Could not transcribe the uploaded audio.', errors);
}
