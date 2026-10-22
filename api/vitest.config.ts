import path from 'node:path';

import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig(async () => {
  // The same migrations that production runs; test/setup.ts applies them to the local D1.
  const migrations = await readD1Migrations(path.join(import.meta.dirname, 'migrations'));
  return {
    plugins: [
      cloudflareTest({
        // The `AI` binding is remote-only (needs an API token). Tests never call it: they inject a fake (test/ingest-fixtures.ts FakeAi).
        remoteBindings: false,
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          // Test-only values; they override wrangler.jsonc `vars` and anything in .dev.vars.
          bindings: {
            AUTH_JWT_SECRET: 'test-jwt-secret-with-enough-length-for-hs256',
            GOOGLE_WEB_CLIENT_ID: 'test-web-client.apps.googleusercontent.com',
            MEDIA_URL_SECRET: 'test-media-url-secret-with-enough-length',
            CORS_ORIGINS: '',
            // Off by default so no test reaches DeepSeek; labeller tests turn it on with makeEnv overrides.
            ENGINE_LLM_ENABLED: 'false',
            TEST_MIGRATIONS: migrations,
          },
        },
      }),
    ],
    test: {
      include: ['test/**/*.test.ts'],
      setupFiles: ['./test/setup.ts'],
    },
  };
});
