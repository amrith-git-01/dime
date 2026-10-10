import { Buffer } from 'node:buffer';

import { beforeEach, describe, expect, it } from 'vitest';

import { getConfig } from '../src/core/env';
import { parseCandidates, parseWithFallback } from '../src/features/ai/deepseek';
import { PermanentAiError, TransientAiError } from '../src/features/ai/errors';
import { estimateOcrNeurons, estimateWhisperNeurons } from '../src/features/ai/neuron-cap';
import { extractReceiptText, mapWorkersAiError, transcribeAudio } from '../src/features/ai/workers-ai';
import type { WorkersAiClient } from '../src/features/ai/workers-ai';
import { ModelOutputError, normalizeCategory, parseModelDate, parseModelOutput, stripJsonFences } from '../src/features/ai/parse-output';
import type { ParseContext } from '../src/features/ai/parse-output';
import { buildReceiptOcrPrompt, buildReceiptParsePrompt, buildSmsParsePrompt, buildVoiceParsePrompt } from '../src/features/ai/prompts';
import { parseReceipt, parseVoice } from '../src/features/ai/service';
import { makeEnv } from './helpers';
import { FakeAi, JPEG, M4A, completion, parsedSms } from './ingest-fixtures';
import { json, useSupabaseStub } from './supabase-stub';

const stub = useSupabaseStub();

const FOOD = '11111111-aaaa-aaaa-aaaa-111111111111';
const OTHER = '22222222-aaaa-aaaa-aaaa-222222222222';
const categories = {
  allowedCategories: ['Food', 'Other', 'Transport'],
  categoryOptions: [
    { id: FOOD, name: 'Food' },
    { id: OTHER, name: 'Other' },
    { id: '33333333-aaaa-aaaa-aaaa-333333333333', name: 'Transport' },
  ],
};
const ctx = (over: Partial<ParseContext> = {}): ParseContext => ({ mode: 'sms', model: 'm1', ...categories, ...over });
const config = (extra: Record<string, string> = {}) => getConfig(makeEnv({ DEEPSEEK_API_KEY: 'ds-key', ...extra }));

describe('prompts (port of test_sms_parse_prompt.py)', () => {
  it('SMS prompt embeds the body, the schema and the categories', () => {
    const prompt = buildSmsParsePrompt('INR 250.00 debited from A/c **** at SWIGGY', ['Food', 'Other']);
    expect(prompt).toContain('SWIGGY');
    expect(prompt.toLowerCase()).toContain('debited');
    expect(prompt).toContain('Food, Other');
    expect(prompt).toContain('ONLY valid JSON');
    expect(prompt).toContain('"confidence":0-1');
  });

  it('receipt and voice prompts, with N/A and "Other" fallbacks', () => {
    expect(buildReceiptParsePrompt('  TOTAL 99  ', ['Food'])).toContain('Receipt OCR text:\n---\nTOTAL 99\n---');
    expect(buildReceiptParsePrompt(null)).toContain('---\nN/A\n---');
    expect(buildReceiptParsePrompt(null)).toContain('exactly one of: Other.');
    expect(buildVoiceParsePrompt('I spent 200 on lunch', ['Food'])).toContain('Voice transcript:\n---\nI spent 200 on lunch\n---');
  });
});

describe('model output normalization (port of _parse_and_validate)', () => {
  it('parses a good answer: amount to cents, category id, date, note', () => {
    const out = parseModelOutput(parsedSms(), ctx());
    expect(out).toEqual({
      counterpartyName: 'Swiggy',
      counterpartyType: 'merchant',
      amount: '250.50',
      type: 'debit',
      date: { ms: Date.UTC(2026, 9, 3), iso: '2026-10-03T00:00:00.000Z' },
      category: 'Food',
      categoryId: FOOD,
      note: 'Dinner from Swiggy',
      confidence: 0.9,
      rawModel: 'm1',
    });
  });

  it('strips markdown fences', () => {
    expect(stripJsonFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(parseModelOutput('```json\n' + parsedSms() + '\n```', ctx()).amount).toBe('250.50');
  });

  it('coerces a blank counterparty to "Unknown" and an odd counterparty type to merchant', () => {
    const out = parseModelOutput(parsedSms({ counterparty_name: '   ', counterparty_type: 'bank' }), ctx());
    expect(out.counterpartyName).toBe('Unknown');
    expect(out.counterpartyType).toBe('merchant');
    expect(parseModelOutput(parsedSms({ counterparty_type: ' person ' }), ctx()).counterpartyType).toBe('person');
  });

  it('builds the default note per source when the model gives none', () => {
    expect(parseModelOutput(parsedSms({ note: null }), ctx()).note).toBe('Auto-parsed from SMS for Swiggy.');
    expect(parseModelOutput(parsedSms({ note: '' }), ctx({ mode: 'receipt' })).note).toBe('Auto-parsed from receipt for Swiggy.');
    expect(parseModelOutput(parsedSms({ note: null }), ctx({ mode: 'voice' })).note).toBe('Auto-parsed from voice input for Swiggy.');
  });

  it('normalizes the category: case-insensitive match, else Other, else the first allowed', () => {
    expect(normalizeCategory(' food ', ['Food', 'Other'])).toBe('Food');
    expect(normalizeCategory('Gadgets', ['Food', 'Other'])).toBe('Other');
    expect(normalizeCategory('Gadgets', ['Food', 'Travel'])).toBe('Food');
    expect(normalizeCategory(' Gadgets ', [])).toBe('Gadgets');
    expect(normalizeCategory(null, [])).toBe('Other');
    const out = parseModelOutput(parsedSms({ category: 'Gadgets' }), ctx());
    expect([out.category, out.categoryId]).toEqual(['Other', OTHER]);
  });

  it('maps a category id the model returned instead of a name (only when the name is not in the options)', () => {
    const out = parseModelOutput(parsedSms({ category: FOOD.toUpperCase() }), {
      mode: 'sms',
      model: 'm',
      allowedCategories: ['Zzz'],
      categoryOptions: [{ id: FOOD, name: 'Food' }],
    });
    expect([out.category, out.categoryId]).toEqual(['Food', FOOD]);
  });

  it('a blank category id (the "Other" placeholder) becomes null', () => {
    const out = parseModelOutput(parsedSms({ category: 'Other' }), { mode: 'sms', model: 'm', allowedCategories: ['Other'], categoryOptions: [{ id: '', name: 'Other' }] });
    expect([out.category, out.categoryId]).toEqual(['Other', null]);
  });

  it('parses dates: ISO, date-only, DD/MM/YYYY, DD-MM-YYYY, YYYY/MM/DD; unusable -> null', () => {
    expect(parseModelDate('2025-02-23T10:30:00+05:30')?.iso).toBe('2025-02-23T05:00:00.000Z');
    expect(parseModelDate('2025-02-23')?.iso).toBe('2025-02-23T00:00:00.000Z');
    expect(parseModelDate('23/02/2025')?.iso).toBe('2025-02-23T00:00:00.000Z');
    expect(parseModelDate('23-02-2025')?.iso).toBe('2025-02-23T00:00:00.000Z');
    expect(parseModelDate('2025/02/23')?.iso).toBe('2025-02-23T00:00:00.000Z');
    expect(parseModelDate('31/02/2025')).toBeNull();
    expect(parseModelDate('23 Feb 2025')).toBeNull();
    expect(parseModelDate(null)).toBeNull();
    expect(parseModelDate('')).toBeNull();
    expect(parseModelOutput(parsedSms({ date: null }), ctx()).date).toBeNull();
  });

  it.each([
    ['not json', 'oops'],
    ['array', '[1]'],
    ['no amount', parsedSms({ amount: undefined })],
    ['zero amount', parsedSms({ amount: 0 })],
    ['negative amount', parsedSms({ amount: -5 })],
    ['amount rounding to zero', parsedSms({ amount: 0.001 })],
    ['text amount', parsedSms({ amount: 'about 5' })],
    ['bad type', parsedSms({ type: 'transfer' })],
    ['confidence above 1', parsedSms({ confidence: 1.5 })],
    ['missing confidence', parsedSms({ confidence: undefined })],
    ['counterparty over 120 chars', parsedSms({ counterparty_name: 'x'.repeat(121) })],
  ])('rejects %s', (_label, raw) => {
    expect(() => parseModelOutput(raw, ctx())).toThrow(ModelOutputError);
  });

  it('accepts numeric strings for amount and confidence', () => {
    const out = parseModelOutput(parsedSms({ amount: '99.999', confidence: '0.5' }), ctx());
    expect([out.amount, out.confidence]).toEqual(['100.00', 0.5]);
  });
});

describe('parse candidates', () => {
  it('reads the configured chain and falls back to AI_MODEL', () => {
    expect(parseCandidates(config().ai)).toEqual([
      { provider: 'deepseek', model: 'deepseek-v4-flash' },
      { provider: 'deepseek', model: 'deepseek-chat' },
    ]);
    expect(parseCandidates({ ...config({ AI_MODEL: 'solo' }).ai, parseFallback: '  ' })).toEqual([{ provider: 'deepseek', model: 'solo' }]);
  });

  it('rejects malformed entries and other providers', () => {
    expect(() => parseCandidates(config({ AI_PARSE_FALLBACK: 'nomodel' }).ai)).toThrow(PermanentAiError);
    expect(() => parseCandidates(config({ AI_PARSE_FALLBACK: 'openai:gpt' }).ai)).toThrow(/only deepseek/);
  });
});

describe('DeepSeek parse with the model fallback chain', () => {
  const deepseekCalls = () => stub.find('POST', '/chat/completions').filter((c) => c.url.host === 'api.deepseek.com');

  it('sends the documented request and returns the parse', async () => {
    stub.on('POST', '/chat/completions', () => json(completion(parsedSms())));
    const out = await parseWithFallback(config().ai, { mode: 'sms', text: 'INR 250.50 debited at SWIGGY', ...categories });
    expect(out.amount).toBe('250.50');
    const call = deepseekCalls()[0];
    expect(call?.headers.get('authorization')).toBe('Bearer ds-key');
    expect(call?.body).toMatchObject({
      model: 'deepseek-v4-flash',
      temperature: 0.1,
      response_format: { type: 'json_object' },
      thinking: { type: 'disabled' },
      messages: [{ role: 'user', content: expect.stringContaining('SWIGGY') as string }],
    });
  });

  it('falls back to the next model after a 5xx, and after unusable JSON', async () => {
    let n = 0;
    stub.on('POST', '/chat/completions', () => {
      n += 1;
      if (n === 1) return json({ error: 'overloaded' }, { status: 503 });
      return json(completion(parsedSms()));
    });
    const out = await parseWithFallback(config().ai, { mode: 'sms', text: 'x', ...categories });
    expect(out.rawModel).toBe('deepseek-chat');
    expect(deepseekCalls().map((c) => (c.body as { model: string }).model)).toEqual(['deepseek-v4-flash', 'deepseek-chat']);

    stub.calls.length = 0;
    n = 0;
    (stub as unknown as { routes: unknown[] }).routes = [];
    stub.on('POST', '/chat/completions', () => {
      n += 1;
      return json(completion(n === 1 ? 'not json' : parsedSms()));
    });
    expect((await parseWithFallback(config().ai, { mode: 'sms', text: 'x', ...categories })).rawModel).toBe('deepseek-chat');
  });

  it('gives each candidate an equal share of AI_TIMEOUT_SECONDS', () => {
    // 45 s over two models: the per-attempt timeout is 22.5 s (asserted through the config split).
    expect(config().ai.timeoutMs / parseCandidates(config().ai).length).toBe(22_500);
  });

  it('is transient when every model fails and at least one failure was retryable', async () => {
    let n = 0;
    stub.on('POST', '/chat/completions', () => (++n === 1 ? json({}, { status: 429 }) : json(completion('garbage'))));
    await expect(parseWithFallback(config().ai, { mode: 'sms', text: 'x', ...categories })).rejects.toBeInstanceOf(TransientAiError);
  });

  it('is permanent when every failure is permanent (bad key, unusable output)', async () => {
    stub.on('POST', '/chat/completions', () => json({ error: 'bad key' }, { status: 401 }));
    const err = await parseWithFallback(config().ai, { mode: 'sms', text: 'x', ...categories }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PermanentAiError);
    // S9: provider detail is not in the message.
    expect((err as Error).message).toBe('AI_PARSE_UNAVAILABLE');
  });

  it('a missing API key is permanent and makes no call', async () => {
    const cfg = getConfig(makeEnv({ DEEPSEEK_API_KEY: undefined }));
    await expect(parseWithFallback(cfg.ai, { mode: 'sms', text: 'x', ...categories })).rejects.toBeInstanceOf(PermanentAiError);
    expect(stub.calls).toHaveLength(0);
  });

  it('network failure is transient', async () => {
    stub.on('POST', '/chat/completions', () => {
      throw new TypeError('fetch failed');
    });
    await expect(parseWithFallback(config().ai, { mode: 'sms', text: 'x', ...categories })).rejects.toBeInstanceOf(TransientAiError);
  });
});

const ai = new FakeAi();
const neurons: number[] = [];
/** A Workers AI client on the fake binding; `gatewayId` and the recorder are the only things tests vary. */
const client = (over: Partial<WorkersAiClient> = {}, extra: Record<string, string> = {}): WorkersAiClient => ({
  binding: ai.asAi(),
  config: config(extra).workersAi,
  timeoutMs: 1000,
  recordNeurons: (n) => {
    neurons.push(n);
    return Promise.resolve();
  },
  ...over,
});
beforeEach(() => {
  ai.calls.length = 0;
  ai.respond = new FakeAi().respond;
  neurons.length = 0;
});

describe('Workers AI OCR and Whisper', () => {
  it('OCR sends the image bytes as a base64 data URL to the vision model and returns the text', async () => {
    ai.respond = () => ({ response: '  STORE\nTOTAL 99  ', usage: { prompt_tokens: 2000, completion_tokens: 100 } });
    const text = await extractReceiptText(client(), { bytes: JPEG, mimeType: 'image/jpeg' });
    expect(text).toBe('STORE\nTOTAL 99');
    expect(ai.calls).toHaveLength(1);
    const call = ai.calls[0];
    expect(call?.model).toBe('@cf/meta/llama-4-scout-17b-16e-instruct');
    const inputs = call?.inputs as { temperature: number; max_tokens: number; messages: { role: string; content: { type: string; text?: string; image_url?: { url: string } }[] }[] };
    expect(inputs.temperature).toBe(0);
    expect(inputs.max_tokens).toBe(2048);
    expect(inputs.messages[0]?.role).toBe('user');
    expect(inputs.messages[0]?.content[0]).toEqual({ type: 'text', text: buildReceiptOcrPrompt() });
    expect(inputs.messages[0]?.content[1]?.image_url?.url).toMatch(/^data:image\/jpeg;base64,\/9j\/4AAQSkZJRg/);
    expect(call?.options?.signal).toBeInstanceOf(AbortSignal);
    expect(call?.options?.gateway).toBeUndefined();
    // Actual usage (2000 in, 100 out) is booked, not the estimate: 2000 x 24545/M + 100 x 77273/M = 56.8 -> 57.
    expect(neurons).toEqual([57]);
  });

  it('OCR: empty text is permanent, non-image mime falls back to jpeg, no usage in the answer books the estimate', async () => {
    ai.respond = () => ({ response: '   ' });
    await expect(extractReceiptText(client(), { bytes: JPEG, mimeType: 'image/jpeg' })).rejects.toBeInstanceOf(PermanentAiError);
    expect(neurons).toEqual([]);
    ai.respond = () => ({ response: 'ok' });
    await extractReceiptText(client(), { bytes: JPEG, mimeType: 'application/octet-stream' });
    expect(JSON.stringify(ai.calls.at(-1)?.inputs)).toContain('data:image/jpeg;base64,');
    expect(neurons).toEqual([estimateOcrNeurons()]);
  });

  it('OCR accepts an OpenAI-shaped answer too', async () => {
    ai.respond = () => completion('FROM CHOICES');
    expect(await extractReceiptText(client(), { bytes: JPEG, mimeType: 'image/jpeg' })).toBe('FROM CHOICES');
  });

  it('the AI Gateway id is passed as the gateway option only when set', async () => {
    await extractReceiptText(client({}, { AI_GATEWAY_ID: 'dime-gw' }), { bytes: JPEG, mimeType: 'image/jpeg' });
    expect(ai.calls.at(-1)?.options?.gateway).toEqual({ id: 'dime-gw' });
    await transcribeAudio(client({}, { AI_GATEWAY_ID: 'dime-gw' }), M4A, 'audio/mp4');
    expect(ai.calls.at(-1)?.options?.gateway).toEqual({ id: 'dime-gw' });
  });

  it('Whisper sends the original audio as base64 to the whisper model and returns the trimmed text', async () => {
    ai.respond = () => ({ text: ' I spent 200 on lunch ' });
    const text = await transcribeAudio(client(), M4A, 'audio/mp4');
    expect(text).toBe('I spent 200 on lunch');
    const call = ai.calls[0];
    expect(call?.model).toBe('@cf/openai/whisper-large-v3-turbo');
    expect(call?.inputs).toEqual({ audio: Buffer.from(M4A).toString('base64') });
    expect(call?.options?.signal).toBeInstanceOf(AbortSignal);
    // No duration in the answer: one (rounded-up) minute at 46.63 neurons.
    expect(neurons).toEqual([estimateWhisperNeurons(M4A.byteLength)]);
    expect(neurons[0]).toBe(47);
  });

  it('Whisper books the real duration when the answer has one', async () => {
    ai.respond = () => ({ text: 'x', transcription_info: { duration: 120 } });
    await transcribeAudio(client(), M4A, 'audio/mp4');
    expect(neurons).toEqual([94]); // 2 minutes x 46.63 = 93.26 -> 94
  });

  it('Whisper: an empty transcript is permanent and books nothing', async () => {
    ai.respond = () => ({ text: '  ' });
    await expect(transcribeAudio(client(), M4A, 'audio/mp4')).rejects.toBeInstanceOf(PermanentAiError);
    expect(neurons).toEqual([]);
  });

  it('a missing AI binding or model is permanent and calls nothing', async () => {
    await expect(transcribeAudio(client({ binding: undefined }), M4A, 'audio/mp4')).rejects.toBeInstanceOf(PermanentAiError);
    await expect(transcribeAudio(client({ config: { ...client().config, whisperModel: '' } }), M4A, 'audio/mp4')).rejects.toBeInstanceOf(PermanentAiError);
    expect(ai.calls).toHaveLength(0);
  });

  it.each([
    ['3040: Capacity temporarily exceeded, please try again.', true],
    ['3036: you have used up your daily free allocation of 10,000 neurons', true],
    ['InferenceUpstreamError: 503 service unavailable', true],
    ['fetch failed', true],
    ['something nobody has seen before', true],
    ['5006: Invalid input: image is too large', false],
    ['AiError: unsupported image format', false],
    ['400 Bad Request', false],
  ])('error mapping: %s -> transient=%s', async (message, transient) => {
    ai.respond = () => {
      throw new Error(message);
    };
    const err = await extractReceiptText(client(), { bytes: JPEG, mimeType: 'image/jpeg' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(transient ? TransientAiError : PermanentAiError);
    // Provider text never reaches the (client-safe) message.
    expect((err as Error).message).not.toContain(message);
    expect(neurons).toEqual([]);
  });

  it('a timeout or abort is transient', () => {
    expect(mapWorkersAiError(new DOMException('timed out', 'TimeoutError'), 'x')).toBeInstanceOf(TransientAiError);
    expect(mapWorkersAiError(new DOMException('aborted', 'AbortError'), 'x')).toBeInstanceOf(TransientAiError);
  });

  it('config: models come from WORKERS_AI_* vars and the caps have their defaults', () => {
    const cfg = config().workersAi;
    expect(cfg).toMatchObject({ whisperModel: '@cf/openai/whisper-large-v3-turbo', visionModel: '@cf/meta/llama-4-scout-17b-16e-instruct', dailyNeuronCap: 8000, userDailyCaptures: 30 });
    expect(cfg.gatewayId).toBeUndefined();
    expect(config({ WORKERS_AI_WHISPER_MODEL: '@cf/openai/whisper', AI_DAILY_NEURON_CAP: '500' }).workersAi).toMatchObject({ whisperModel: '@cf/openai/whisper', dailyNeuronCap: 500 });
  });

  it('config: AI Gateway routes DeepSeek only when both ids are set, and only DeepSeek URLs', () => {
    const plain = config();
    expect(plain.ai.baseUrl).toBe('https://api.deepseek.com/chat/completions');
    expect(plain.agent.baseUrl).toBe('https://api.deepseek.com');
    expect(config({ AI_GATEWAY_ID: 'gw' }).ai.baseUrl).toBe('https://api.deepseek.com/chat/completions');
    const gw = config({ AI_GATEWAY_ID: 'gw', CF_ACCOUNT_ID: 'acct' });
    expect(gw.ai.baseUrl).toBe('https://gateway.ai.cloudflare.com/v1/acct/gw/deepseek/chat/completions');
    expect(gw.agent.baseUrl).toBe('https://gateway.ai.cloudflare.com/v1/acct/gw/deepseek');
    expect(config({ AI_GATEWAY_ID: 'gw', CF_ACCOUNT_ID: 'acct', AI_BASE_URL: 'https://other.example/v1/chat/completions' }).ai.baseUrl).toBe(
      'https://other.example/v1/chat/completions',
    );
  });
});

describe('AI service wiring', () => {
  it('parseReceipt: Workers AI OCR text feeds the DeepSeek prompt; errors carry a generic message', async () => {
    stub.on('POST', '/chat/completions', () => json(completion(parsedSms())));
    ai.respond = () => ({ response: 'SWIGGY TOTAL 250.50' });
    const out = await parseReceipt(config(), client(), { bytes: JPEG, mimeType: 'image/jpeg' }, categories);
    expect(out.counterpartyName).toBe('Swiggy');
    const deepseek = stub.find('POST', '/chat/completions').find((c) => c.url.host === 'api.deepseek.com');
    expect(JSON.stringify(deepseek?.body)).toContain('SWIGGY TOTAL 250.50');

    ai.respond = () => {
      throw new Error('400 Bad Request: secret provider text');
    };
    const err = await parseReceipt(config(), client(), { bytes: JPEG, mimeType: 'image/jpeg' }, categories).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PermanentAiError);
    expect((err as Error).message).toBe('Could not read text from the uploaded receipt.');
  });

  it('parseVoice: a transient transcription failure stays transient', async () => {
    ai.respond = () => {
      throw new Error('3040: Capacity temporarily exceeded');
    };
    const err = await parseVoice(config(), client(), M4A, 'audio/mp4', categories).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TransientAiError);
    expect((err as Error).message).toBe('Could not transcribe the uploaded audio.');
  });
});
