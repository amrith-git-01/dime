import { getConfig } from '../../core/env';
import type { AppConfig, Bindings } from '../../core/env';
import { log } from '../../core/logging';
import type { Db } from '../../core/db';
import { BrevoClient } from './brevo';
import { buildDigestPayload } from './digest-payload';
import { renderDigestHtml, renderWelcomeHtml } from './html';
import { IST } from './periods';
import type { DigestPeriod } from './periods';
import { createQuoteSource } from './quotes';
import type { Quote } from './quotes';
import * as sends from './sends-repository';
import type { PushSender } from '../notifications/emitter';
import type { Publisher } from '../realtime/events';
import { envPublisher } from '../realtime/publish';
import { patch as patchSettings } from '../user-settings/service';
import { UnsubscribeSecretError, signUnsubscribeToken, unsubscribeUrl, verifyUnsubscribeToken } from './tokens';
import type { DigestKind } from './tokens';

export interface WelcomeEmailInput {
  userId: string;
  /** Account email from the JWT; the caller only invokes the service when it is non-empty. */
  email: string;
  username: string | null;
}

/** Email entry points used by other features (`GET /me` triggers the welcome email). */
export interface EmailService {
  /**
   * Send the one-time welcome email unless `email_sends` already has `(user_id, 'welcome', 'once')`.
   * Callers run it fire-and-forget (`waitUntil`); it is safe to call repeatedly and never throws on a
   * failed send (the claim is released so a later call can retry).
   */
  sendWelcomeIfNeeded(input: WelcomeEmailInput): Promise<void>;
}

export interface EmailDeps {
  db: Db;
  config: AppConfig;
  brevo: BrevoClient;
  /** One random quote per call; the batch shares a single lazily fetched page. */
  quote: () => Promise<Quote>;
  /** Used by the Broke Report messages on the same queue (the in-app bell and the push); digests ignore them. */
  publisher?: Publisher | undefined;
  pushSend?: PushSender | undefined;
}

export function createEmailDeps(env: Bindings, db: Db): EmailDeps {
  const config = getConfig(env);
  return {
    db,
    config,
    brevo: new BrevoClient(config.email.brevoApiKey, config.email.from),
    quote: createQuoteSource(config.email.favqsApiKey),
    publisher: envPublisher(env),
  };
}

export function displayName(username: string | null | undefined, email: string): string {
  if (username?.trim()) return username.trim();
  const local = (email.split('@')[0] ?? '').trim();
  return local || 'there';
}

/** Folder URL of the postcard PNGs: `EMAIL_ASSET_BASE_URL`, else this Worker's own `/email/*` static assets. */
export function assetBase(config: AppConfig): string {
  return config.email.assetBaseUrl ?? `${config.email.publicBaseUrl}/email`;
}

async function unsubscribeUrls(config: AppConfig, userId: string): Promise<{ weekly: string; monthly: string }> {
  const secret = config.email.unsubscribeSecret;
  const [weekly, monthly] = await Promise.all(
    (['weekly', 'monthly'] as const).map(async (kind) =>
      unsubscribeUrl({ publicBase: config.email.publicBaseUrl, token: await signUnsubscribeToken({ secret, userId, kind }) }),
    ),
  );
  return { weekly: weekly as string, monthly: monthly as string };
}

/** Whether sending is configured; logs why not (S3: no hardcoded fallback secret, so it just skips). */
export function emailConfigured(config: AppConfig, what: string): boolean {
  if (!config.email.brevoApiKey) {
    log.info('email_skipped_no_brevo_key', { what });
    return false;
  }
  if (!config.email.unsubscribeSecret) {
    log.warn('email_skipped_no_unsubscribe_secret', { what });
    return false;
  }
  return true;
}

/** The welcome email (kind `welcome`, period `once`). A failed send releases the claim and is only logged. */
export async function sendWelcome(deps: EmailDeps, input: WelcomeEmailInput): Promise<void> {
  if (!input.email.trim()) return;
  if (!emailConfigured(deps.config, 'welcome')) return;

  const key: sends.SendKey = { userId: input.userId, kind: 'welcome', periodKey: 'once' };
  if (!(await sends.tryBegin(deps.db, key))) return;

  let messageId: string | null;
  try {
    const urls = await unsubscribeUrls(deps.config, input.userId);
    const [quoteText, quoteAuthor] = await deps.quote();
    const name = displayName(input.username, input.email);
    messageId = await deps.brevo.sendHtml({
      toEmail: input.email,
      toName: name,
      subject: "You're in. This is Dime.",
      html: renderWelcomeHtml({
        name,
        assetBase: assetBase(deps.config),
        appLink: deps.config.email.appLink,
        quoteText,
        quoteAuthor,
      }),
      listUnsubscribeUrl: urls.weekly,
    });
  } catch (err) {
    log.error('welcome_send_failed', { err, userId: input.userId });
    await sends.deletePending(deps.db, key);
    return;
  }
  await sends.markSent(deps.db, key, messageId);
}

export type DigestOutcome = 'sent' | 'skipped';

/**
 * One digest email for one user and period: look up the address, claim the send, build the payload,
 * send, mark sent. A failure after the claim releases it and rethrows (the queue consumer decides
 * between retrying and giving up). `skipped` = no address, or already claimed/sent by someone else.
 */
export async function sendDigest(deps: EmailDeps, input: { userId: string; period: DigestPeriod }): Promise<DigestOutcome> {
  const { userId, period } = input;
  const user = await sends.fetchUserEmail(deps.db, userId);
  if (!user.email) return 'skipped';

  const key: sends.SendKey = { userId, kind: period.kind, periodKey: period.periodKey };
  if (!(await sends.tryBegin(deps.db, key))) return 'skipped';

  let messageId: string | null;
  try {
    const [payload, urls, [quoteText, quoteAuthor]] = await Promise.all([
      buildDigestPayload(deps.db, {
        userId,
        range: period.range,
        budgetYear: period.budgetYear,
        budgetMonth: period.budgetMonth,
        tz: IST,
      }),
      unsubscribeUrls(deps.config, userId),
      deps.quote(),
    ]);
    const name = displayName(user.username, user.email);
    const html = renderDigestHtml({
      kicker: period.kicker,
      rangeLabel: period.rangeLabel,
      spent: payload.spent,
      income: payload.income,
      net: payload.net,
      name,
      quoteText,
      quoteAuthor,
      payees: payload.payees,
      incomeSources: payload.incomeSources,
      categories: payload.categories,
      topExpenses: payload.topExpenses,
      budgetLine: payload.budgetLine,
      budgetPct: payload.budgetPct,
      appLink: deps.config.email.appLink,
    });
    messageId = await deps.brevo.sendHtml({
      toEmail: user.email,
      toName: name,
      subject: period.subject,
      html,
      listUnsubscribeUrl: period.kind === 'weekly' ? urls.weekly : urls.monthly,
    });
  } catch (err) {
    try {
      await sends.deletePending(deps.db, key);
    } catch (releaseErr) {
      // The stale claim is reclaimed after 30 minutes.
      log.error('email_release_claim_failed', { err: releaseErr, userId, kind: period.kind });
    }
    throw err;
  }
  await sends.markSent(deps.db, key, messageId);
  return 'sent';
}

/**
 * Factory the routes use. Built per request from `env` and the request's D1 database (do not
 * cache across requests).
 */
export function createEmailService(env: Bindings, db: Db): EmailService {
  const deps = createEmailDeps(env, db);
  return { sendWelcomeIfNeeded: (input) => sendWelcome(deps, input) };
}

/**
 * Verify a signed unsubscribe token and switch that digest off. `null` for a bad, expired or
 * unverifiable token (including a missing secret: S3, no fallback key).
 */
export async function unsubscribe(db: Db, config: AppConfig, token: string): Promise<DigestKind | null> {
  let parsed: Awaited<ReturnType<typeof verifyUnsubscribeToken>>;
  try {
    parsed = await verifyUnsubscribeToken({ secret: config.email.unsubscribeSecret, token });
  } catch (err) {
    if (err instanceof UnsubscribeSecretError) {
      log.error('unsubscribe_rejected_no_secret', {});
      return null;
    }
    throw err;
  }
  if (!parsed) return null;
  await patchSettings(db, parsed.userId, parsed.kind === 'weekly' ? { weekly_email_enabled: false } : { monthly_email_enabled: false });
  return parsed.kind;
}
