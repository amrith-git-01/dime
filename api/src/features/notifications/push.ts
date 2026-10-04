import * as z from 'zod';

import { fetchJson } from '../../core/http';
import { log } from '../../core/logging';

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
/** Expo accepts at most 100 messages per request. */
export const EXPO_BATCH_SIZE = 100;
const TIMEOUT_MS = 5000;

const responseSchema = z.object({
  data: z.array(z.object({ status: z.string(), details: z.unknown().optional(), message: z.string().optional() })),
});

export interface PushInput {
  tokens: string[];
  title: string;
  body: string;
  data: Record<string, unknown>;
  /** Called for each token Expo reports as `DeviceNotRegistered` (prune it). */
  onInvalidToken: (token: string) => unknown;
}

function isDeviceNotRegistered(ticket: { details?: unknown; message?: string }): boolean {
  const details = ticket.details;
  const code: unknown = typeof details === 'object' && details !== null ? (details as { error?: unknown }).error : undefined;
  return code === 'DeviceNotRegistered' || (typeof ticket.message === 'string' && ticket.message.includes('DeviceNotRegistered'));
}

async function sendBatch(tokens: string[], input: PushInput): Promise<void> {
  const messages = tokens.map((to) => ({
    to,
    title: input.title,
    body: input.body,
    data: input.data,
    sound: 'default',
    channelId: 'dime-alerts',
  }));
  try {
    // No retries: re-posting could deliver a duplicate notification.
    const { data } = await fetchJson(EXPO_PUSH_URL, {
      method: 'POST',
      json: messages,
      headers: { Accept: 'application/json' },
      timeoutMs: TIMEOUT_MS,
      retries: 0,
      upstream: 'expo-push',
      schema: responseSchema,
    });
    await Promise.all(
      data.map(async (ticket, i) => {
        const token = tokens[i];
        if (token === undefined || ticket.status !== 'error' || !isDeviceNotRegistered(ticket)) return;
        try {
          await input.onInvalidToken(token);
        } catch (err) {
          log.error('push_invalid_token_callback_failed', { err });
        }
      }),
    );
  } catch (err) {
    log.error('expo_push_failed', { err, tokens: tokens.length });
  }
}

/** Send one notification to every token (batched, concurrently). Never throws: push is best effort. */
export async function sendExpoPush(input: PushInput): Promise<void> {
  if (input.tokens.length === 0) return;
  const batches: string[][] = [];
  for (let i = 0; i < input.tokens.length; i += EXPO_BATCH_SIZE) {
    batches.push(input.tokens.slice(i, i + EXPO_BATCH_SIZE));
  }
  await Promise.all(batches.map((batch) => sendBatch(batch, input)));
}
