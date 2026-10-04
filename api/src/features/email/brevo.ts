import { UpstreamError } from '../../core/errors';
import { fetchWithRetry } from '../../core/http';
import { log } from '../../core/logging';

/** Brevo transactional email (`POST /v3/smtp/email`). */

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
const BREVO_TIMEOUT_MS = 20_000;
const TRANSIENT_STATUSES = new Set([408, 425, 429]);

const FROM_RE = /^\s*(.+?)\s*<([^>]+)>\s*$/;

/** `Dime <hello@x.com>` -> `["Dime", "hello@x.com"]`; a bare address gets the name "Dime". */
export function parseFromAddress(raw: string): [name: string, email: string] {
  const stripped = raw.trim();
  const m = FROM_RE.exec(stripped);
  if (m) return [(m[1] ?? '').trim().replace(/^"+|"+$/g, ''), (m[2] ?? '').trim()];
  return ['Dime', stripped];
}

/** Brevo refused the message for a reason a retry cannot fix (bad address, bad key, bad payload). */
export class PermanentEmailError extends Error {
  override name = 'PermanentEmailError';
}

export interface BrevoMessage {
  toEmail: string;
  toName?: string | null;
  subject: string;
  html: string;
  listUnsubscribeUrl?: string | null;
}

export class BrevoClient {
  private readonly apiKey: string | null;
  private readonly fromName: string;
  private readonly fromEmail: string;

  constructor(apiKey: string | undefined, fromRaw: string) {
    this.apiKey = apiKey?.trim() ? apiKey.trim() : null;
    [this.fromName, this.fromEmail] = parseFromAddress(fromRaw);
  }

  get enabled(): boolean {
    return this.apiKey !== null;
  }

  /**
   * Send one HTML email; returns Brevo's message id (`"ok"` when absent) or null when no key is
   * configured. Never retried here: a repeated POST could double-send. Network errors, timeouts,
   * 408/425/429 and 5xx throw `UpstreamError` (transient); other refusals throw `PermanentEmailError`.
   */
  async sendHtml(message: BrevoMessage): Promise<string | null> {
    if (!this.apiKey) {
      log.info('brevo_skipped_no_key', {});
      return null;
    }
    const payload: Record<string, unknown> = {
      sender: { name: this.fromName, email: this.fromEmail },
      to: [{ email: message.toEmail, ...(message.toName ? { name: message.toName } : {}) }],
      subject: message.subject,
      htmlContent: message.html,
    };
    if (message.listUnsubscribeUrl) {
      payload['headers'] = {
        'List-Unsubscribe': `<${message.listUnsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      };
    }

    const res = await fetchWithRetry(BREVO_URL, {
      method: 'POST',
      upstream: 'brevo',
      timeoutMs: BREVO_TIMEOUT_MS,
      retries: 0,
      retryOnStatus: [],
      headers: { 'api-key': this.apiKey, accept: 'application/json' },
      json: payload,
    });
    if (res.status !== 201 && res.status !== 202) {
      const text = (await res.text().catch(() => '')).slice(0, 500);
      log.warn('brevo_send_failed', { status: res.status, body: text });
      if (TRANSIENT_STATUSES.has(res.status) || res.status >= 500) throw new UpstreamError(`brevo returned ${res.status}.`);
      throw new PermanentEmailError(`brevo returned ${res.status}.`);
    }
    const data = (await res.json().catch(() => null)) as { messageId?: unknown } | null;
    const id = data?.messageId;
    return typeof id === 'string' || typeof id === 'number' ? String(id) : 'ok';
  }
}
