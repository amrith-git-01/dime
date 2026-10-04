import * as z from 'zod';

/**
 * Conversation memory: a small object the server hands back after every turn and the client returns
 * unchanged on the next one ("and July?"). It is HMAC-SHA256 signed with AGENT_MEMORY_SECRET and
 * base64url encoded (`<payload>.<mac>`), bound to the user and valid for 24 hours, so follow-ups work
 * without ever trusting text the client wrote.
 *
 * `verifyMemory` returns null for anything that is not a fresh token of THIS user (bad format,
 * tampered, wrong key, other user, expired): the turn then simply runs without memory.
 */

const MEMORY_VERSION = 1;
export const MEMORY_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_TOKEN_CHARS = 4096;
const MAX_SUMMARY = 300;

const memorySchema = z.object({
  v: z.literal(MEMORY_VERSION),
  user_id: z.string().min(1).max(64),
  time_range: z.object({ from: z.string().max(10), to: z.string().max(10), label: z.string().max(80) }).nullable(),
  entities: z.array(z.object({ type: z.enum(['payee', 'category']), id: z.string().max(120), name: z.string().max(120) })).max(6),
  last_tools: z.array(z.string().max(40)).max(6),
  summary: z.string().max(MAX_SUMMARY),
  /** Expiry, epoch seconds. */
  exp: z.number().int(),
});
export type AgentMemory = z.infer<typeof memorySchema>;

export type MemoryContent = Pick<AgentMemory, 'time_range' | 'entities' | 'last_tools' | 'summary'>;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const toBase64Url = (bytes: Uint8Array): string => {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

function fromBase64Url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  try {
    const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

const hmacKey = (secret: string, usage: 'sign' | 'verify') =>
  crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);

export async function signMemory(secret: string, userId: string, content: MemoryContent, nowMs: number): Promise<string> {
  const memory: AgentMemory = {
    v: MEMORY_VERSION,
    user_id: userId,
    time_range: content.time_range,
    entities: content.entities.slice(0, 6),
    last_tools: content.last_tools.slice(0, 6),
    summary: content.summary.slice(0, MAX_SUMMARY),
    exp: Math.floor((nowMs + MEMORY_TTL_MS) / 1000),
  };
  const payload = toBase64Url(encoder.encode(JSON.stringify(memory)));
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret, 'sign'), encoder.encode(payload)));
  return `${payload}.${toBase64Url(mac)}`;
}

export async function verifyMemory(secret: string, token: string | null | undefined, userId: string, nowMs: number): Promise<AgentMemory | null> {
  if (!token || token.length > MAX_TOKEN_CHARS) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, mac] = parts as [string, string];
  const macBytes = fromBase64Url(mac);
  if (!macBytes || macBytes.length === 0) return null;
  // `verify` compares in constant time.
  const valid = await crypto.subtle.verify('HMAC', await hmacKey(secret, 'verify'), macBytes, encoder.encode(payload));
  if (!valid) return null;
  const bytes = fromBase64Url(payload);
  if (!bytes) return null;
  let json: unknown;
  try {
    json = JSON.parse(decoder.decode(bytes));
  } catch {
    return null;
  }
  const parsed = memorySchema.safeParse(json);
  if (!parsed.success) return null;
  const memory = parsed.data;
  if (memory.user_id !== userId || memory.exp * 1000 <= nowMs) return null;
  return memory;
}
