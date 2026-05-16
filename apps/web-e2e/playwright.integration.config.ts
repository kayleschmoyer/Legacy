import { defineConfig } from '@playwright/test';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load root .env so JWT_SECRET and other vars are available to test helpers
config({ path: resolve(__dirname, '../../.env') });
// Load .env.e2e for local integration test credentials (gitignored)
config({ path: resolve(__dirname, '../../.env.e2e'), override: false });

export default defineConfig({
  testDir: './src/integration/tests',
  globalSetup: './src/integration/global-setup.ts',
  globalTeardown: './src/integration/global-teardown.ts',
  timeout: 120_000,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* No retries — flake against the live backend is a P1 bug.  Retrying papered
   * over genuine signal: 2 retries meant 67% of CI runs hid flake. */
  retries: 0,
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
    trace: 'retain-on-failure',
  },
});
