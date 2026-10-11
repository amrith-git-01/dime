import { first, newId, nowIso } from '../../core/db';
import type { Db } from '../../core/db';
import { ValidationError } from '../../core/errors';
import { fetchUsername } from '../user-profile/repository';
import type { FeedbackBody } from './schemas';

export async function createFeedback(
  db: Db,
  userId: string,
  body: FeedbackBody,
  email: string | undefined,
): Promise<{ id: string }> {
  const message = body.message.trim();
  if (message.length < 8) throw new ValidationError('message must be at least 8 characters');

  const username = (await fetchUsername(db, userId))?.trim();
  const row = await first<{ id: string }>(
    db,
    `INSERT INTO user_feedback (id, user_id, message, feedback_type, reporter_email, reporter_username, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [newId(), userId, message, body.type, email?.trim() ? email.trim() : null, username ? username : null, nowIso()],
  );
  if (!row) throw new Error('feedback insert returned no row');
  return { id: String(row.id) };
}
