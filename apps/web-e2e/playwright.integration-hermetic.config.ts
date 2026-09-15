import { defineConfig } from '@playwright/test';

import { resolvePwBrowserExecutable } from './src/resolve-pw-browser';

/* Cloud sessions (Claude Code on the web) pre-install Playwright's browsers at
 * /opt/pw-browsers, but that image drifts independently of the repo's pinned
 * @playwright/test version (LS-8319). Falls back to whatever build is present
 * when the pinned one is missing; undefined (no override) on machines where
 * /opt/pw-browsers doesn't exist, e.g. the GH Actions runner AMI. */
const pwBrowserExecutable = resolvePwBrowserExecutable();

/**
 * `playwright.integration.config.ts` minus `globalSetup`/`globalTeardown`
 * (LS-10155).
 *
 * `src/integration/tests/` isn't exclusively live-backend: it also holds
 * hermetic `*.contract.spec.ts` files — `wait-for-join-page-helpers.contract.spec.ts`,
 * `reload-until-visible.contract.spec.ts` (LS-8684) — that live there
 * deliberately "so the existing Playwright integration runner picks them up",
 * but stub every request via `page.route`/`fetch` and touch no network. Running
 * them through `playwright.integration.config.ts` still pays for the live-backend
 * `globalSetup` (JWT mint, stale-league sweep, and the LS-10138 league-cap
 * preflight, which can abort the whole run on an unrelated shared-environment
 * quota condition) even though a hermetic contract spec needs none of it.
 *
 * Selected by `nx_run_e2e_specs({ integration: true, skipGlobalSetup: true })`,
 * which also skips the tool's own JWT/E2EPOOLPASSWORD precondition checks —
 * neither applies here since nothing in this config touches the live backend.
 *
 * Deliberately kept in sync with `playwright.integration.config.ts` for
 * everything that isn't about the live backend (timeout, reporter, browser
 * resolution): only `globalSetup`/`globalTeardown`, `baseURL`, and the
 * live-backend throttling (`workers: 1`, `fullyParallel: false`) differ.
 */
export default defineConfig({
  testDir: './src/integration/tests',
  timeout: 120_000,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [
    // Compact, agent-targeted Markdown summary (LS-7838).
    [
      './src/reporters/agent-md-reporter.ts',
      { outputFile: 'test-results/summary.md' },
    ],
    ['html', { open: 'never' }],
    ['list'],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  use: {
    trace: 'off',
    ...(pwBrowserExecutable
      ? { launchOptions: { executablePath: pwBrowserExecutable } }
      : {}),
  },
  projects: [
    {
      name: 'integration',
      testDir: './src/integration/tests',
    },
  ],
});
