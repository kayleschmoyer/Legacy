import { defineConfig } from '@playwright/test';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load root .env so JWT_SECRET and other vars are available to test helpers
config({ path: resolve(__dirname, '../../.env') });

export default defineConfig({
  testDir: './src/integration/tests',
  timeout: 120_000,
  retries: 2,
  // Serialize test execution to avoid API Gateway / Lambda throttling under
  // concurrent load.  Each file still runs phases sequentially (fullyParallel:
  // false).  With workers=1 the live backend only handles one league-creation
  // flow at a time, eliminating the "Failed to fetch" errors seen with 3
  // workers.
  workers: 1,
  fullyParallel: false,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL:
      process.env.INTEGRATION_BASE_URL ?? 'https://api.legacy-fantasy.com/',
    trace: 'on-first-retry',
  },
});
