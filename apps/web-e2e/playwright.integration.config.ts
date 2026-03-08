import { defineConfig } from '@playwright/test';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load root .env so JWT_SECRET and other vars are available to test helpers
config({ path: resolve(__dirname, '../../.env') });

export default defineConfig({
  testDir: './src/integration/tests',
  timeout: 120_000,
  retries: 1,
  workers: 1,
  fullyParallel: false,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL:
      process.env.INTEGRATION_BASE_URL ??
      'https://bd1opa1yv7.execute-api.us-east-1.amazonaws.com/dev/',
    trace: 'on-first-retry',
  },
});
