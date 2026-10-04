import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        // Test-only values; they override wrangler.jsonc `vars` and anything in .dev.vars.
        bindings: {
          SUPABASE_URL: 'https://test-project.supabase.co',
          SUPABASE_JWT_SECRET: 'test-jwt-secret-with-enough-length-for-hs256',
          SUPABASE_SECRET_KEY: 'test-service-role-key',
          SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
          CORS_ORIGINS: '',
        },
      },
    }),
  ],
  test: {
    include: ['test/**/*.test.ts'],
  },
});
