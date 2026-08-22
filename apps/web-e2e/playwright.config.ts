import { defineConfig, devices } from '@playwright/test';
import path from 'path';

import {
  resolvePwBrowserExecutable,
  resolvePwFirefoxExecutable,
  resolvePwWebkitExecutable,
} from './src/resolve-pw-browser';

/* Cloud sessions (Claude Code on the web) pre-install Playwright's browsers at
 * /opt/pw-browsers, but that image drifts independently of the repo's pinned
 * @playwright/test version (LS-8319). When the pinned build is missing but an
 * older build is present, fall back to it instead of failing at launch; when
 * /opt/pw-browsers doesn't exist at all (e.g. the GH Actions runner AMI, which
 * uses a separate, already version-locked /opt/playwright-browsers), this is
 * undefined and Playwright resolves the browser itself as before.
 *
 * chrome-headless-shell covers both the chromium project and Mobile Chrome
 * (Playwright picks the headless-shell executable for any chromium-engine
 * project once `headless` is true, regardless of device/viewport emulation —
 * LS-8739). firefox and webkit are separate engines with their own pinned
 * revisions on disk, so they get their own resolvers; Mobile Safari shares
 * webkit's since it's also a WebKit-engine project. */
const pwBrowserExecutable = resolvePwBrowserExecutable();
const pwFirefoxExecutable = resolvePwFirefoxExecutable();
const pwWebkitExecutable = resolvePwWebkitExecutable();

/**
 * Dedicated E2E port — intentionally different from the Vite dev-server (4200)
 * so local test runs exercise the same static-serve path that CI uses.
 */
const E2E_PORT = Number(process.env.E2E_PORT) || 4280;

/**
 * LS-9075 gave phone-width browsers (`media.sm`, maxWidth 800 — well above
 * both mobile projects' 375px viewport) a dedicated card-feed UI
 * (`PlayersCardFeed`: sport toggle, a fixed ALL/QB/RB/WR/TE/K/DST chip rail,
 * search, infinite-scroll cards) in place of the desktop data grid. These
 * specs assert desktop-grid-only affordances that the card feed has no
 * equivalent for by design — sortable column headers, the format/column
 * picker, the team-filter `<select>`, Hitters/Pitchers/Combined view tabs,
 * and category tabs with header-driven sort — so they only make sense
 * against the desktop `chromium`/`firefox`/`webkit` projects (LS-9471).
 *
 * LS-9493: the four specs below assert the same canonical-surface-only
 * affordances (the `select[name="team-filter"]` dropdown and the granular
 * 10-position `FootballPositionPillGroup`, both from footballStatsConfig.tsx)
 * but were missed when the list above was built, so they deterministically
 * timed out on Mobile Chrome — 500+ Playwright TimeoutErrors misread as CI
 * resource contention were actually this same viewport/UI mismatch.
 */
const DESKTOP_GRID_ONLY_SPECS = [
  /nfl-player-stats-category-tabs\.spec\.ts$/,
  /player-stats-fantasy-sort\.spec\.ts$/,
  /player-stats-format-preference\.spec\.ts$/,
  /player-stats-search-and-filters\.spec\.ts$/,
  /sport-aware-player-list\.spec\.ts$/,
  /football-availability-filter\.spec\.ts$/,
  /football-players-team-filter\.spec\.ts$/,
  /football-team-filter\.spec\.ts$/,
  /football-players-position-url\.spec\.ts$/,
  /football-position-filter-a11y\.spec\.ts$/,
];

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './src/tests',

  /* Support $env:PLAYWRIGHT_GREP and $env:PLAYWRIGHT_GREP_INVERT so Windows
   * users can pass grep patterns containing | without CMD interpreting the pipe.
   * Example: $env:PLAYWRIGHT_GREP='@critical|@smoke' ; pnpm exec nx e2e web-e2e */
  ...(process.env.PLAYWRIGHT_GREP
    ? { grep: new RegExp(process.env.PLAYWRIGHT_GREP) }
    : {}),
  ...(process.env.PLAYWRIGHT_GREP_INVERT
    ? { grepInvert: new RegExp(process.env.PLAYWRIGHT_GREP_INVERT) }
    : {}),

  /* Authenticate once via global setup, then share storageState with all tests.
   * CI: signs a JWT with a hardcoded dev secret (hermetic — no backend
   *     validates it).
   * Local: uses OAuth device flow (opens browser, caches token). */
  globalSetup: require.resolve('./src/global-setup'),
  /* Merge per-test source-coverage fragments into one per-shard artifact at the
   * end of the run (LS-7849). No-op unless COLLECT_COVERAGE is set (nightly). */
  globalTeardown: require.resolve('./src/coverage-global-teardown'),
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* No retries — flake is a P1 bug, not something to paper over. A failing test
   * should fail on its first run so the signal is visible in CI. */
  retries: 0,
  /* 4 workers: GHA runners have 7GB RAM; Playwright tests are I/O-bound not CPU-bound,
   * so 4 parallel browsers (~400MB) finishes in ~5min vs ~15min at 2 workers */
  workers: process.env.CI ? 4 : undefined,
  /* Per-test timeout cap.  Budget math: a typical test has up to ~6 chained
   * assertions plus one navigation/action.  With expect.timeout=3s and
   * actionTimeout=10s, 6 expects + 1 action = 28s, fitting in 30s with
   * headroom.  This is the Playwright default — earlier 20s was below the
   * worst-case sum of inner timeouts and caused deterministic TLE on slow runs. */
  timeout: 30000,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    // Compact, agent-targeted Markdown summary (LS-7838) — readable with a
    // plain file read, ~20-50x smaller than the HTML SPA.
    [
      './src/reporters/agent-md-reporter.ts',
      { outputFile: 'test-results/summary.md' },
    ],
    ['json', { outputFile: 'test-results/results.json' }],
    ['line'], // Console output for real-time feedback
    ...(process.env.CI ? [['blob'] as const] : []),
  ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: `http://localhost:${E2E_PORT}`,

    /* Pre-authenticated browser state generated by global-setup.ts */
    storageState: path.join(__dirname, '.auth/state.json'),

    /* Cap how long page actions (click, fill, waitFor, goto) can run.
     * Default is 0 (inherits the per-test timeout above, consuming it
     * entirely on a single stuck action).  10s for actions leaves room
     * within the 30s test budget for multiple assertions; navigation gets
     * 15s for cold-cache page loads. */
    actionTimeout: 10000,
    navigationTimeout: 15000,

    /* Emulate prefers-reduced-motion so the ScoreboardTicker renders its
     * static layout instead of the continuously-translating animated strip.
     * Without this, Playwright flags links inside the scrolling inner container
     * as "not stable" because the CSS animation keeps moving the element.
     * Note: reducedMotion lives inside contextOptions (not top-level use) in
     * Playwright 1.59.x — top-level reducedMotion is not a typed property. */
    contextOptions: { reducedMotion: 'reduce' },

    /* Traces disabled (LS-4537): a single trace zip can exceed GitHub's 100 MB
     * per-file limit when pushed to the legacy-sports-deploys gh-pages branch,
     * causing the Deploy Playwright Report job to fail. Re-enable once report
     * hosting is migrated to S3/CloudFront. */
    trace: 'off',
  },

  expect: {
    /* Per-assertion polling cap.  Sized so that ~6 chained expects (18s) plus
     * one action (10s) still fits in the 30s test budget with headroom.
     * Cold V8 JIT on CI typically commits within 1–2s; 3s leaves margin
     * without letting a single hung assertion consume the whole test. */
    timeout: 3000,
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
        ...(pwBrowserExecutable
          ? { launchOptions: { executablePath: pwBrowserExecutable } }
          : {}),
      },
    },

    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        viewport: { width: 1280, height: 720 },
        ...(pwFirefoxExecutable
          ? { launchOptions: { executablePath: pwFirefoxExecutable } }
          : {}),
      },
    },

    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        viewport: { width: 1280, height: 720 },
        ...(pwWebkitExecutable
          ? { launchOptions: { executablePath: pwWebkitExecutable } }
          : {}),
      },
    },

    /* Test against mobile viewports. */
    {
      name: 'Mobile Chrome',
      testIgnore: DESKTOP_GRID_ONLY_SPECS,
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 375, height: 667 },
        ...(pwBrowserExecutable
          ? { launchOptions: { executablePath: pwBrowserExecutable } }
          : {}),
      },
    },
    {
      name: 'Mobile Safari',
      testIgnore: DESKTOP_GRID_ONLY_SPECS,
      use: {
        ...devices['iPhone 12'],
        viewport: { width: 375, height: 667 },
        ...(pwWebkitExecutable
          ? { launchOptions: { executablePath: pwWebkitExecutable } }
          : {}),
      },
    },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Serve the static production build — mirrors CI exactly.
   * The nx e2e targets build web first (dependsOn in apps/web-e2e/project.json,
   * LS-9069); only direct `playwright test` invocations need a manual
   * `pnpm exec nx build web` when dist/apps/web is stale / missing.
   * Uses a dedicated port so the Vite dev-server (4200) can stay running.
   *
   * Best-practice notes (https://playwright.dev/docs/test-webserver):
   *   • cwd pinned to repo root so dist/apps/web resolves regardless of
   *     where `playwright test` is invoked from.
   *   • 127.0.0.1 for the health-check avoids DNS resolution delays.
   *   • stdout/stderr piped so Playwright captures server logs on failure.
   *   • reuseExistingServer is hard-off (LS-9069): a lingering preview server
   *     serves the bundle it started with, so reusing one silently defeats
   *     the freshness guarantee even after a rebuild (LS-7861, LS-9068).
   *     An occupied port now fails loudly — kill the stale server (or set
   *     E2E_PORT) instead of letting the run reuse it. */
  webServer: {
    // Use vite preview instead of a plain static server so that Vite's
    // production CSS preloading and chunk-splitting work correctly.  Plain
    // static servers (serve, http-server) don't set the headers that
    // Chromium requires when it validates <link rel="preload" as="style"
    // crossOrigin=""> requests, causing lazyWithRetry to crash.
    // --filter web runs the command in apps/web/ where Vite's config lives;
    // --outDir ../../dist/apps/web points at the nx build output (the nx
    // @nx/vite:build executor overrides vite.config's outDir to dist/apps/web).
    command: `pnpm --filter web exec vite preview --port ${E2E_PORT} --host 127.0.0.1 --outDir ../../dist/apps/web`,
    cwd: path.resolve(__dirname, '../..'),
    url: `http://127.0.0.1:${E2E_PORT}`,
    reuseExistingServer: false,
    timeout: 30_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
