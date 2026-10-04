import { ValidationError } from '../../core/errors';
import type { DimeSupabaseClient } from '../../core/supabase';
import { fetchUsername } from '../user-profile/repository';
import type { FeedbackBody } from './schemas';

export async function createFeedback(
  db: DimeSupabaseClient,
  userId: string,
  body: FeedbackBody,
  email: string | undefined,
): Promise<{ id: string }> {
  const message = body.message.trim();
  if (message.length < 8) throw new ValidationError('message must be at least 8 characters');

  const username = (await fetchUsername(db, userId))?.trim();
  const { data } = await db
    .from('user_feedback')
    .insert({
      user_id: userId,
      message,
      feedback_type: body.type,
      reporter_email: email?.trim() ? email.trim() : null,
      reporter_username: username ? username : null,
    })
    .select('id')
    .single()
    .throwOnError()
    .overrideTypes<{ id: string | number }, { merge: false }>();
  return { id: String(data.id) };
}
