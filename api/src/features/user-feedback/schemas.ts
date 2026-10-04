import * as z from 'zod';

export const feedbackBodySchema = z.object({
  type: z.enum(['bug', 'idea', 'enhancement']),
  message: z.string().min(1).max(1000).transform((s) => s.trim()),
});
export type FeedbackBody = z.infer<typeof feedbackBodySchema>;
