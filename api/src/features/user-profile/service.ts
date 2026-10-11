import type { AuthUser } from '../../core/auth';
import type { Db } from '../../core/db';
import { log } from '../../core/logging';
import type { EmailService } from '../email/service';
import * as repo from './repository';
import type { MeResponse, ProfileUpdateBody, UserRow } from './schemas';

/** Schedules work that must not delay the response (`ctx.waitUntil`). */
export type Background = (task: Promise<unknown>, name: string) => void;

function rowToMe(user: Pick<AuthUser, 'id' | 'email'>, row: UserRow | null): MeResponse {
  // Sign-in creates the row with column defaults (currency 'INR'); until a username is set the account is
  // not onboarded and answers exactly like the old "no row" case.
  const profile = row?.username == null ? null : row;
  return {
    id: user.id,
    email: user.email ?? null,
    username: typeof profile?.username === 'string' ? profile.username : null,
    avatar_url: typeof profile?.avatar_url === 'string' ? profile.avatar_url : null,
    currency: typeof profile?.currency === 'string' ? profile.currency : null,
  };
}

/**
 * Read the profile. The email is persisted only when it differs from the stored one, and the
 * welcome email is attempted only when the row is missing (new account) or the email just changed;
 * `email_sends` still guarantees it is sent once. Both side effects run in the background.
 */
export async function getMe(
  db: Db,
  user: AuthUser,
  deps: { email: EmailService; background: Background },
): Promise<MeResponse> {
  const row = await repo.fetchById(db, user.id);
  const me = rowToMe(user, row);

  const email = user.email;
  if (email) {
    const emailChanged = row !== null && row.email !== email;
    // Sign-in creates the row, so a row without a username is a not-yet-onboarded account: the old "no row" trigger.
    if (row === null || row.username === null || emailChanged) {
      deps.background(
        (async () => {
          if (emailChanged) {
            try {
              await repo.updateEmailIfRowExists(db, user.id, email);
            } catch (err) {
              log.error('persist_email_failed', { err, userId: user.id });
            }
          }
          await deps.email.sendWelcomeIfNeeded({ userId: user.id, email, username: me.username });
        })(),
        'welcome-email',
      );
    }
  }
  return me;
}

export async function updateProfile(db: Db, user: AuthUser, body: ProfileUpdateBody): Promise<MeResponse> {
  const avatar = body.avatar_url?.trim();
  const row = await repo.upsertProfile(db, {
    userId: user.id,
    username: body.username.trim(),
    currency: body.currency.trim(),
    avatarUrl: avatar ? avatar : null,
  });
  return rowToMe(user, row);
}
