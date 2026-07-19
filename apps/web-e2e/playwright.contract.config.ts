import { defineConfig, devices } from '@playwright/test';

/**
 * Dedicated config for the shared driver-contract suite (ADR-0016; LS-8447).
 *
 * Deliberately isolated from the hermetic app config (`playwright.config.ts`):
 * NO globalSetup (no auth), NO webServer (no `dist/apps/web` build), NO
 * storageState. The contract exercises only driver mechanics against a
 * `data:`-URL fixture (web) or an emulator (native), so it needs none of that
 * apparatus and stays fast + hermetic.
 *
 * Two projects, split by filename so the native project never launches a
 * browser and the web project never touches WebdriverIO:
 *   - `web-driver-contract`  → `*web.contract.spec.ts`  on Chromium (runs in CI)
 *   - `native-driver-contract` → `*.native.spec.ts`     on Appium (emulator-gated;
 *     each spec skips itself when no emulator is configured)
 *
 * Run: `pnpm exec playwright test --config=apps/web-e2e/playwright.contract.config.ts`
 * (or the `contract` / `contract:native` nx targets).
 */
export default defineConfig({
  testDir: './src/driver/contract',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 4 : undefined,
  timeout: 30_000,
  reporter: [
    ['line'],
    ['json', { outputFile: 'test-results/contract-results.json' }],
  ],
  expect: {
    timeout: 5_000,
  },
  projects: [
    {
      name: 'web-driver-contract',
      testMatch: /web\.contract\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: 'native-driver-contract',
      // Appium-backed specs — no Playwright browser. They self-skip without an
      // emulator (see `src/driver/appium-env.ts`).
      testMatch: /\.native\.spec\.ts$/,
    },
  ],
});
