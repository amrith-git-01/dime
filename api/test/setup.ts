import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeAll, beforeEach } from 'vitest';

import { resetMemoCaches } from '../src/core/memo-cache';
import { resetDb } from './db';

// Real local D1 with the production migrations; every test starts from the seed data plus the default user.
beforeAll(async () => {
  await applyD1Migrations(env.DB, (env as unknown as { TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1] }).TEST_MIGRATIONS);
});

beforeEach(async () => {
  resetMemoCaches(); // the database is rolled back below, so isolate-memory answers must go too
  await resetDb();
  // R2 is not rolled back between tests either.
  const { objects } = await env.MEDIA.list();
  if (objects.length > 0) await env.MEDIA.delete(objects.map((o) => o.key));
});
