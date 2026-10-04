import * as z from 'zod';

import type { AuthUser } from './auth';
import type { DimeSupabaseClient } from './supabase';

/**
 * Secrets are not in wrangler.jsonc, so `wrangler types` does not know them in CI.
 * They are declared here (optional: a missing one is reported by the feature that needs it).
 */
interface SecretBindings {
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_SECRET_KEY?: string;
  SUPABASE_JWT_SECRET?: string;
  DEEPSEEK_API_KEY?: string;
  GROQ_API_KEY?: string;
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
  /** Lazily created service-role client. Read it with `getSupabase(c)`. */
  supabase?: DimeSupabaseClient;
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
  SUPABASE_URL: z.url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  SUPABASE_SECRET_KEY: z.string().optional(),
  SUPABASE_JWT_SECRET: z.string().optional(),

  STORAGE_BUCKET: z.string().default('Dime'),
  PRIVATE_STORAGE_BUCKET: z.string().default('Dime-private'),
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

  GROQ_API_KEY: z.string().optional(),
  GROQ_BASE_URL: z.string().default('https://api.groq.com/openai/v1'),
  GROQ_WHISPER_PRIMARY: z.string().default('whisper-large-v3-turbo'),
  GROQ_WHISPER_FALLBACK: z.string().default('whisper-large-v3'),
  GROQ_VISION_OCR_MODEL: z.string().default('meta-llama/llama-4-scout-17b-16e-instruct'),

  AGENT_ENABLED: z.stringbool().default(true),
  AGENT_BASE_URL: z.string().default('https://api.deepseek.com'),
  AGENT_MODEL: z.string().default('deepseek-v4-flash'),
  AGENT_MODEL_FALLBACK: z.string().optional(),
  AGENT_MAX_STEPS: int(4),
  AGENT_TURN_TIMEOUT_SECONDS: num(25),
  AGENT_LLM_TIMEOUT_SECONDS: num(12),
  AGENT_DAILY_TOKEN_BUDGET: int(200_000),
  AGENT_SQL_TIMEOUT_SECONDS: num(3),
  AGENT_SQL_MAX_ROWS: int(500),
  AGENT_MEMORY_SECRET: z.string().optional(),

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
  supabaseUrl: string;
  supabasePublishableKey: string | undefined;
  supabaseSecretKey: string | undefined;
  supabaseJwtSecret: string | undefined;
  storageBucket: string;
  privateStorageBucket: string;
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
  groq: {
    apiKey: string | undefined;
    baseUrl: string;
    whisperPrimary: string;
    whisperFallback: string;
    visionOcrModel: string;
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
    sqlTimeoutMs: number;
    sqlMaxRows: number;
    memorySecret: string | undefined;
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

function build(p: Parsed): AppConfig {
  return {
    supabaseUrl: p.SUPABASE_URL.replace(/\/+$/, ''),
    supabasePublishableKey: p.SUPABASE_PUBLISHABLE_KEY,
    supabaseSecretKey: p.SUPABASE_SECRET_KEY,
    supabaseJwtSecret: p.SUPABASE_JWT_SECRET,
    storageBucket: p.STORAGE_BUCKET,
    privateStorageBucket: p.PRIVATE_STORAGE_BUCKET,
    maxReceiptUploadBytes: p.MAX_RECEIPT_UPLOAD_BYTES,
    maxVoiceUploadBytes: p.MAX_VOICE_UPLOAD_BYTES,
    signedUrlTtlSeconds: p.SIGNED_URL_TTL_SECONDS,
    avatarUrlAllowedHosts: p.AVATAR_URL_ALLOWED_HOSTS,
    corsOrigins: p.CORS_ORIGINS,
    ai: {
      apiKey: p.DEEPSEEK_API_KEY,
      baseUrl: p.AI_BASE_URL,
      model: p.AI_MODEL,
      parseFallback: p.AI_PARSE_FALLBACK,
      timeoutMs: p.AI_TIMEOUT_SECONDS * 1000,
      temperature: p.AI_TEMPERATURE,
    },
    groq: {
      apiKey: p.GROQ_API_KEY,
      baseUrl: p.GROQ_BASE_URL,
      whisperPrimary: p.GROQ_WHISPER_PRIMARY,
      whisperFallback: p.GROQ_WHISPER_FALLBACK,
      visionOcrModel: p.GROQ_VISION_OCR_MODEL,
    },
    agent: {
      enabled: p.AGENT_ENABLED,
      baseUrl: p.AGENT_BASE_URL,
      model: p.AGENT_MODEL,
      modelFallback: p.AGENT_MODEL_FALLBACK,
      maxSteps: p.AGENT_MAX_STEPS,
      turnTimeoutMs: p.AGENT_TURN_TIMEOUT_SECONDS * 1000,
      llmTimeoutMs: p.AGENT_LLM_TIMEOUT_SECONDS * 1000,
      dailyTokenBudget: p.AGENT_DAILY_TOKEN_BUDGET,
      sqlTimeoutMs: p.AGENT_SQL_TIMEOUT_SECONDS * 1000,
      sqlMaxRows: p.AGENT_SQL_MAX_ROWS,
      memorySecret: p.AGENT_MEMORY_SECRET,
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

const CSV_KEYS = new Set(['CORS_ORIGINS', 'AVATAR_URL_ALLOWED_HOSTS']);

const cache = new WeakMap<object, AppConfig>();

/** Legacy aliases the Python settings accepted. */
const ALIASES: Record<string, string> = {
  SUPABASE_KEY: 'SUPABASE_PUBLISHABLE_KEY',
  SUPABASE_SERVICE_ROLE_KEY: 'SUPABASE_SECRET_KEY',
  AI_API_KEY: 'DEEPSEEK_API_KEY',
  AVATAR_STORAGE_BUCKET: 'STORAGE_BUCKET',
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
