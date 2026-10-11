import * as z from 'zod';

export const pushTokenBodySchema = z.strictObject({
  token: z.string().min(8).max(512),
  platform: z.literal('android').default('android'),
});

export const pushTokenDeleteBodySchema = z.strictObject({ token: z.string().max(512).nullish() });
