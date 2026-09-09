import { defineConfig } from '@playwright/test';

import type { BackendOptions, PlatformOptions } from './src/fixtures/dual';

/**
 * Marks every worker process this config spawns as native-only (LS-9864).
 * `dual.ts` reads this at module load — before `test.extend()` runs — to
 * choose the native implementation of `driver`/`testData`, which never
 * names the `page` fixture in their signature. This must happen at import
 * time, not inside a fixture body: Playwright resolves every fixture named
 * in a function's destructured parameters before the body runs, so a
 * runtime `if (platform === 'native')` branch inside a fixture that still
 * destructures `page` doesn't help — the browser gets launched anyway. Set
 * here (not in dual.ts) so the gate lives at the project-config level, and
 * only this dedicated native config ever sets it.
 */
process.env.E2E_DUAL_PLATFORM = 'native';

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
 * LS-8448, and emulator provisioning LS-8450) is wired: this config's
 * `native-android` project runs against a real emulator via
 * `.github/workflows/e2e-native-android.yml` (dispatch + post-build trigger).
 * See ADR-0018 for the as-built design record. It is still not run in PR CI —
 * that workflow is the dedicated native entry point, mirroring the
 * `test-suite`-gated dispatch pattern in `run-playwright-tests.yml`.
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
     * hermetic native runs use the per-worker out-of-process GraphQL mock server
     * (ADR-0017 — LS-8448): the emulator app is pointed at it via env
     * (`EXPO_PUBLIC_GRAPHQL_HOST` + `adb reverse`) and it serves the same
     * operation-name-keyed factory payloads the web mocks serve. Switch a native
     * project to `backend: 'live'` for flows that need the real backend (e.g.
     * WebSocket-driven live draft — see `realtimeUnavailable`, AC4). */
    backend: 'mock',
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
