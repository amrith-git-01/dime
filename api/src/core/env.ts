import * as z from 'zod';

import type { AuthUser } from './auth';

/**
 * Secrets are not in wrangler.jsonc, so `wrangler types` does not know them in CI.
 * They are declared here (optional: a missing one is reported by the feature that needs it).
 */
interface SecretBindings {
  /** HMAC key of signed `/media` links (MEDIA_URL_SECRET). Missing = private media links are null and `/media` private reads answer 503. */
  MEDIA_URL_SECRET?: string;
  /** HS256 key of our access tokens (AUTH_JWT_SECRET). Missing = sign-in and every authenticated route answer 503. */
  AUTH_JWT_SECRET?: string;
  DEEPSEEK_API_KEY?: string;
  BREVO_API_KEY?: string;
  EMAIL_UNSUBSCRIBE_SECRET?: string;
  EMAIL_CRON_SECRET?: string;
  FAVQS_API_KEY?: string;
  /** HMAC key for the agent's conversation-memory token (AGENT_MEMORY_SECRET). Missing = no follow-up memory. */
  AGENT_MEMORY_SECRET?: string;
}

/** Generated `Env` (wrangler types) plus secrets. Use this everywhere instead of `Env`. */
export type Bindings = Env & SecretBindings;

interface Variables {
  requestId: string;
  /** Set by `requireAuth`. Read it with `currentUser(c)`. */
  user?: AuthUser;
  /** Session id (`sid` claim) of the access token. Set by `requireAuth`. */
  sessionId?: string;
}

export interface AppBindings {
  Bindings: Bindings;
  Variables: Variables;
}

const csv = (fallback: string[]) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? fallback : v.split(',').map((s) => s.trim()).filter(Boolean)));

const int = (fallback: number) => z.coerce.number().int().positive().default(fallback);
const num = (fallback: number) => z.coerce.number().positive().default(fallback);

const configSchema = z.object({
  AUTH_JWT_SECRET: z.string().optional(),
  GOOGLE_WEB_CLIENT_ID: csv([]),

  MEDIA_URL_SECRET: z.string().optional(),
  MAX_RECEIPT_UPLOAD_BYTES: int(10 * 1024 * 1024),
  MAX_VOICE_UPLOAD_BYTES: int(15 * 1024 * 1024),
  SIGNED_URL_TTL_SECONDS: int(6 * 60 * 60),
  AVATAR_URL_ALLOWED_HOSTS: csv(['api.dicebear.com']),
  CORS_ORIGINS: csv([]),

  DEEPSEEK_API_KEY: z.string().optional(),
  AI_BASE_URL: z.string().default('https://api.deepseek.com/chat/completions'),
  AI_MODEL: z.string().default('deepseek-v4-flash'),
  AI_PARSE_FALLBACK: z.string().default('deepseek:deepseek-v4-flash,deepseek:deepseek-chat'),
  AI_TIMEOUT_SECONDS: num(25),
  AI_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.1),

  WORKERS_AI_WHISPER_MODEL: z.string().default('@cf/openai/whisper-large-v3-turbo'),
  WORKERS_AI_VISION_MODEL: z.string().default('@cf/meta/llama-4-scout-17b-16e-instruct'),
  // Workers AI is free up to 10,000 neurons/day (account-wide) and billed above: stay under it.
  AI_DAILY_NEURON_CAP: z.coerce.number().int().min(0).default(8000),
  AI_USER_DAILY_RECEIPTS: z.coerce.number().int().min(0).default(10),
  AI_USER_DAILY_VOICE: z.coerce.number().int().min(0).default(10),
  // Optional AI Gateway (logs, spend limit). Workers AI uses the id alone; DeepSeek also needs CF_ACCOUNT_ID.
  AI_GATEWAY_ID: z.string().optional(),
  CF_ACCOUNT_ID: z.string().optional(),

  AGENT_ENABLED: z.stringbool().default(true),
  AGENT_BASE_URL: z.string().default('https://api.deepseek.com'),
  AGENT_MODEL: z.string().default('deepseek-v4-flash'),
  AGENT_MODEL_FALLBACK: z.string().optional(),
  AGENT_MAX_STEPS: int(6),
  AGENT_TURN_TIMEOUT_SECONDS: num(25),
  AGENT_LLM_TIMEOUT_SECONDS: num(12),
  AGENT_DAILY_TOKEN_BUDGET: int(200_000),
  AGENT_DAILY_QUESTIONS: int(5),
  AGENT_MEMORY_SECRET: z.string().optional(),

  // Predictive engine (features/engine/labeller.ts): one DeepSeek call per user per night, off unless enabled.
  ENGINE_LLM_ENABLED: z.stringbool().default(false),
  ENGINE_DAILY_TOKEN_BUDGET: z.coerce.number().int().min(0).default(2_000_000),
  ENGINE_MODEL: z.string().optional(),

  BREVO_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('Dime <hello@localhost>'),
  EMAIL_UNSUBSCRIBE_SECRET: z.string().optional(),
  EMAIL_APP_LINK: z.string().default('https://play.google.com/store'),
  EMAIL_CRON_SECRET: z.string().optional(),
  EMAIL_PUBLIC_BASE_URL: z.string().default('http://127.0.0.1:8787'),
  EMAIL_ASSET_BASE_URL: z.string().optional(),
  FAVQS_API_KEY: z.string().optional(),
});

type Parsed = z.output<typeof configSchema>;

/** Same data as the schema output, with camelCase keys that feature code actually reads. */
export interface AppConfig {
  /** The Worker's public origin (no trailing slash): host of `/media` links. Same value as `email.publicBaseUrl`. */
  publicBaseUrl: string;
  auth: { jwtSecret: string | undefined; googleClientIds: string[] };
  mediaUrlSecret: string | undefined;
  maxReceiptUploadBytes: number;
  maxVoiceUploadBytes: number;
  signedUrlTtlSeconds: number;
  avatarUrlAllowedHosts: string[];
  corsOrigins: string[];
  ai: {
    apiKey: string | undefined;
    baseUrl: string;
    model: string;
    parseFallback: string;
    timeoutMs: number;
    temperature: number;
  };
  workersAi: {
    whisperModel: string;
    visionModel: string;
    /** Neurons per UTC day, account-wide, above which uploads answer 429 and queued jobs fail. */
    dailyNeuronCap: number;
    /** Receipt scans one user may make per UTC day. */
    userDailyReceipts: number;
    /** Voice captures one user may make per UTC day. */
    userDailyVoice: number;
    gatewayId: string | undefined;
  };
  agent: {
    enabled: boolean;
    baseUrl: string;
    model: string;
    modelFallback: string | undefined;
    maxSteps: number;
    turnTimeoutMs: number;
    llmTimeoutMs: number;
    dailyTokenBudget: number;
    /** Questions (turns) one user may ask per UTC day. */
    dailyQuestions: number;
    memorySecret: string | undefined;
  };
  engine: {
    /** Kill switch of the nightly DeepSeek labeller; off = the forecast uses its code templates only. */
    llmEnabled: boolean;
    baseUrl: string;
    model: string;
    /** Prompt + completion tokens the labeller may spend per UTC day, all users together. */
    dailyTokenBudget: number;
  };
  email: {
    brevoApiKey: string | undefined;
    from: string;
    unsubscribeSecret: string | undefined;
    appLink: string;
    cronSecret: string | undefined;
    publicBaseUrl: string;
    assetBaseUrl: string | undefined;
    favqsApiKey: string | undefined;
  };
}

/** Thrown for a broken deployment (missing/invalid vars). Surfaces as a generic 500 with the detail in logs. */
export class ConfigError extends Error {
  override name = 'ConfigError';
}

const DEEPSEEK_ORIGIN = 'https://api.deepseek.com';

/** Routes DeepSeek calls through AI Gateway when both ids are set; any other URL is left alone. */
function deepseekVia(p: Parsed, url: string): string {
  if (!p.AI_GATEWAY_ID || !p.CF_ACCOUNT_ID || !url.startsWith(DEEPSEEK_ORIGIN)) return url;
  return `https://gateway.ai.cloudflare.com/v1/${p.CF_ACCOUNT_ID}/${p.AI_GATEWAY_ID}/deepseek${url.slice(DEEPSEEK_ORIGIN.length)}`;
}

function build(p: Parsed): AppConfig {
  return {
    publicBaseUrl: p.EMAIL_PUBLIC_BASE_URL.replace(/\/+$/, ''),
    auth: { jwtSecret: p.AUTH_JWT_SECRET, googleClientIds: p.GOOGLE_WEB_CLIENT_ID },
    mediaUrlSecret: p.MEDIA_URL_SECRET,
    maxReceiptUploadBytes: p.MAX_RECEIPT_UPLOAD_BYTES,
    maxVoiceUploadBytes: p.MAX_VOICE_UPLOAD_BYTES,
    signedUrlTtlSeconds: p.SIGNED_URL_TTL_SECONDS,
    avatarUrlAllowedHosts: p.AVATAR_URL_ALLOWED_HOSTS,
    corsOrigins: p.CORS_ORIGINS,
    ai: {
      apiKey: p.DEEPSEEK_API_KEY,
      baseUrl: deepseekVia(p, p.AI_BASE_URL),
      model: p.AI_MODEL,
      parseFallback: p.AI_PARSE_FALLBACK,
      timeoutMs: p.AI_TIMEOUT_SECONDS * 1000,
      temperature: p.AI_TEMPERATURE,
    },
    workersAi: {
      whisperModel: p.WORKERS_AI_WHISPER_MODEL.trim(),
      visionModel: p.WORKERS_AI_VISION_MODEL.trim(),
      dailyNeuronCap: p.AI_DAILY_NEURON_CAP,
      userDailyReceipts: p.AI_USER_DAILY_RECEIPTS,
      userDailyVoice: p.AI_USER_DAILY_VOICE,
      gatewayId: p.AI_GATEWAY_ID,
    },
    agent: {
      enabled: p.AGENT_ENABLED,
      baseUrl: deepseekVia(p, p.AGENT_BASE_URL),
      model: p.AGENT_MODEL,
      modelFallback: p.AGENT_MODEL_FALLBACK,
      maxSteps: p.AGENT_MAX_STEPS,
      turnTimeoutMs: p.AGENT_TURN_TIMEOUT_SECONDS * 1000,
      llmTimeoutMs: p.AGENT_LLM_TIMEOUT_SECONDS * 1000,
      dailyTokenBudget: p.AGENT_DAILY_TOKEN_BUDGET,
      dailyQuestions: p.AGENT_DAILY_QUESTIONS,
      memorySecret: p.AGENT_MEMORY_SECRET,
    },
    engine: {
      llmEnabled: p.ENGINE_LLM_ENABLED,
      baseUrl: deepseekVia(p, p.AGENT_BASE_URL),
      model: p.ENGINE_MODEL?.trim() || p.AGENT_MODEL,
      dailyTokenBudget: p.ENGINE_DAILY_TOKEN_BUDGET,
    },
    email: {
      brevoApiKey: p.BREVO_API_KEY,
      from: p.EMAIL_FROM,
      unsubscribeSecret: p.EMAIL_UNSUBSCRIBE_SECRET,
      appLink: p.EMAIL_APP_LINK,
      cronSecret: p.EMAIL_CRON_SECRET,
      publicBaseUrl: p.EMAIL_PUBLIC_BASE_URL.replace(/\/+$/, ''),
      assetBaseUrl: p.EMAIL_ASSET_BASE_URL?.replace(/\/+$/, ''),
      favqsApiKey: p.FAVQS_API_KEY,
    },
  };
}

const CSV_KEYS = new Set(['CORS_ORIGINS', 'AVATAR_URL_ALLOWED_HOSTS', 'GOOGLE_WEB_CLIENT_ID']);

const cache = new WeakMap<object, AppConfig>();

/** Legacy aliases the Python settings accepted. */
const ALIASES: Record<string, string> = {
  AI_API_KEY: 'DEEPSEEK_API_KEY',
};

function collect(env: Bindings): Record<string, unknown> {
  const raw = env as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(configSchema.shape)) {
    const v = raw[key];
    if (typeof v !== 'string') continue;
    const trimmed = v.trim();
    // An empty string means "unset" (how .env files are written), except CSV lists where it means "none".
    if (trimmed !== '' || CSV_KEYS.has(key)) out[key] = trimmed;
  }
  for (const [alias, target] of Object.entries(ALIASES)) {
    const v = raw[alias];
    if (out[target] === undefined && typeof v === 'string' && v.trim() !== '') out[target] = v.trim();
  }
  return out;
}

/**
 * Validated, typed configuration. Parsed once per isolate (the `env` object is stable across
 * requests), so request handlers pay a WeakMap lookup only.
 */
export function getConfig(env: Bindings): AppConfig {
  const hit = cache.get(env);
  if (hit) return hit;
  const result = configSchema.safeParse(collect(env));
  if (!result.success) {
    const problems = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new ConfigError(`Invalid configuration: ${problems}`);
  }
  const config = build(result.data);
  cache.set(env, config);
  return config;
}
