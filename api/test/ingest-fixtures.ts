import { USER_ID } from './helpers';

export const JOB = 'aaaaaaaa-0000-0000-0000-00000000000a';
export const TX = 'bbbbbbbb-0000-0000-0000-00000000000b';
export const CAT_FOOD = 'cccccccc-0000-0000-0000-00000000000c';
export const KEY = '5c0e7d9e-3b0f-4f3c-9a55-0c1d2e3f4a5b';
export const TZ = 'timezone=Asia%2FKolkata';

/** A queue binding double that records what was sent (and can be told to fail). */
export class FakeQueue {
  readonly sent: unknown[] = [];
  failWith: Error | undefined;

  send(body: unknown): Promise<void> {
    if (this.failWith) return Promise.reject(this.failWith);
    this.sent.push(body);
    return Promise.resolve();
  }

  sendBatch(messages: Iterable<{ body: unknown }>): Promise<void> {
    if (this.failWith) return Promise.reject(this.failWith);
    for (const m of messages) this.sent.push(m.body);
    return Promise.resolve();
  }

  asQueue(): Queue {
    return this as unknown as Queue;
  }
}

/** One recorded `env.AI.run` call. */
export interface AiCall {
  model: string;
  inputs: Record<string, unknown>;
  options: { signal?: AbortSignal; gateway?: { id: string } } | undefined;
}

/**
 * The Workers AI binding double (the real one cannot run under miniflare). `respond` returns the model's
 * answer or throws; the default plays Whisper and Llama 4 Scout.
 */
export class FakeAi {
  readonly calls: AiCall[] = [];
  respond: (call: AiCall) => unknown = (call) =>
    call.model.includes('whisper')
      ? { text: 'spent two fifty on dinner at swiggy' }
      : { response: 'OCR TEXT SWIGGY 250.50', usage: { prompt_tokens: 1500, completion_tokens: 100 } };

  run(model: string, inputs: Record<string, unknown>, options?: AiCall['options']): Promise<unknown> {
    const call = { model, inputs, options };
    this.calls.push(call);
    try {
      return Promise.resolve(this.respond(call));
    } catch (err) {
      return Promise.reject(err instanceof Error ? err : new Error(String(err)));
    }
  }

  asAi(): Ai {
    return this as unknown as Ai;
  }
}

/** A queue message double: records ack / retry. */
export class FakeMessage {
  acked = false;
  retried: { delaySeconds?: number } | undefined;
  readonly id = 'msg-1';

  constructor(
    readonly body: unknown,
    readonly attempts = 1,
  ) {}

  ack(): void {
    this.acked = true;
  }

  retry(options?: { delaySeconds?: number }): void {
    this.retried = options ?? {};
  }
}

export function fakeBatch(queue: string, messages: FakeMessage[]): MessageBatch<unknown> {
  return { queue, messages, ackAll: () => messages.forEach((m) => m.ack()), retryAll: () => undefined } as unknown as MessageBatch<unknown>;
}

export const smsPayload = (over: Record<string, unknown> = {}) => ({
  body: 'INR 250.50 debited at SWIGGY',
  received_at: '2026-10-04T10:00:00.000Z',
  timezone: 'Asia/Kolkata',
  ...over,
});

export const mediaPayload = (over: Record<string, unknown> = {}) => ({
  object_path: `receipts/${USER_ID}/receipts/2026-10-04/1-abcd1234.jpg`,
  mime_type: 'image/jpeg',
  timezone: 'Asia/Kolkata',
  ...over,
});

export const jobRow = (over: Record<string, unknown> = {}) => ({
  id: JOB,
  user_id: USER_ID,
  kind: 'sms',
  payload: smsPayload(),
  status: 'pending',
  attempts: 0,
  last_error: null,
  idempotency_key: null,
  result: null,
  created_at: '2026-10-04T10:00:00+00:00',
  updated_at: '2026-10-04T10:00:00+00:00',
  ...over,
});

/** Magic-byte headers: just enough for the sniffers. */
export const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, ...new Array<number>(64).fill(7)]);
export const M4A = new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20, ...new Array<number>(64).fill(3)]);
export const CAF = new Uint8Array([0x63, 0x61, 0x66, 0x66, 0, 1, 0, 0, 0x64, 0x65, 0x73, 0x63, ...new Array<number>(64).fill(1)]);
export const TEXT = new TextEncoder().encode('hello this is not an image at all, just text');

export function uploadForm(bytes: Uint8Array, name = 'file.bin', type = 'application/octet-stream'): FormData {
  const form = new FormData();
  form.append('file', new File([bytes], name, { type }));
  return form;
}

/** DeepSeek chat-completions JSON answer. */
export const completion = (content: string) => ({ choices: [{ message: { content } }] });

export const parsedSms = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    counterparty_name: 'Swiggy',
    counterparty_type: 'merchant',
    amount: 250.5,
    type: 'debit',
    date: '2026-10-03',
    category: 'Food',
    note: 'Dinner from Swiggy',
    confidence: 0.9,
    ...over,
  });
