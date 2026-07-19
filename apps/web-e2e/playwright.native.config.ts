import { defineConfig } from '@playwright/test';

import type { BackendOptions, PlatformOptions } from './src/fixtures/dual';

/**
 * Native E2E config (ADR-0016 native rollout blueprint, step 3 — LS-8449).
 *
 * The SAME shared spec bodies the hermetic browser projects run mocked
 * (`playwright.config.ts`) and the `shared-live` project runs live
 * (`playwright.integration.config.ts`) run here against a native
 * {@link AppDriver} — functional native coverage is the shared suite through a
 * native driver, not a parallel test suite (ADR-0016). The Playwright runner
 * stays the single orchestrator; only the `platform` project option changes.
 *
 * A dedicated config (mirroring the integration config) keeps this project
 * layout composed alongside the browser + shared-live projects WITHOUT touching
 * their project lists, so PR CI — which runs `playwright.config.ts` filtered to
 * `--project=chromium` — is unchanged (AC3). Native runs are invoked
 * explicitly: `playwright test --config=playwright.native.config.ts
 * --project=native-android` filters to a native project, and reports label
 * results by that project name (AC4).
 *
 * Capability model (ADR-0016 §capability model / AC2): the native driver
 * declares every capability `false` (no in-process `networkMock`, `clock`,
 * `trace`, `hover`, or `multiWindow`). A shared spec that needs one gates on it
 * — `test.skip(!driver.capabilities.clock, 'no clock on native')` — so a
 * missing capability skips cleanly rather than failing at runtime.
 *
 * Native EXECUTION (Appium driver LS-8447, per-worker hermetic mock server
 * LS-8448, and emulator provisioning LS-8450) is not wired yet; this config is
 * the runner-side scaffold those tickets build on. It is not run in PR CI.
 */
export default defineConfig<BackendOptions & PlatformOptions>({
  // The shared, platform-neutral suite — the native functional surface.
  testDir: './src/tests/shared',

  /* Fail the build on CI if a `test.only` was left in source. */
  forbidOnly: !!process.env.CI,
  /* No retries — flake is a P1 bug, not something to paper over. */
  retries: 0,
  /* One device session at a time — an emulator is a single serial resource. */
  workers: 1,
  fullyParallel: false,
  /* Generous per-test budget: native app cold starts and deep-link opens are
   * slower than a browser navigation. Matches the integration config. */
  timeout: 120_000,

  reporter: [
    // Compact, agent-targeted Markdown summary (LS-7838); results are labeled
    // by project name, so native runs are distinguishable in the report (AC4).
    [
      './src/reporters/agent-md-reporter.ts',
      { outputFile: 'test-results/summary.md' },
    ],
    ['list'],
    ['json', { outputFile: 'test-results/results.json' }],
  ],

  use: {
    /* Native has no in-process network interception (`networkMock: false`), so
     * native projects run against the live backend — the same identity path as
     * the `shared-live` project. A hermetic-native backend (per-worker GraphQL
     * mock server) arrives with LS-8448. */
    backend: 'live',
    trace: 'off',
  },

  /* Platform is selected PER PROJECT (AC1). Additional native projects
   * (e.g. `native-ios`) slot in the same way once their emulator lane exists. */
  projects: [
    {
      name: 'native-android',
      use: { platform: 'native' },
    },
  ],
});
