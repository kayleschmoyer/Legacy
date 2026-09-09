import {
  test as base,
  expect,
  type Page,
  type TestInfo,
} from '@playwright/test';

import { withApiIsolation } from './api-isolation';
import { attributePageCoverage, snapshotCoverageBaseline } from './coverage';
import {
  clearReverseForward,
  createNativeMockServer,
  NativeMockTestData,
  reverseForwardToDevice,
} from './native-mock';
import { LiveTestData, MockTestData, type TestData } from './test-data';
import {
  buildIntegrationStorageState,
  getAuthJwt,
  WEB_BASE,
} from '../integration/fixtures/ui';
import { DraftPage, LeaguePage, PlayersPage, RosterPage } from '../pages';
import { NavHeader } from '../components';
import {
  type AppDriver,
  createNativeDriver,
  PlaywrightWebDriver,
} from '../driver';
import { isNativeEmulatorConfigured } from '../driver/appium-env';
import type { GraphQLMockServer } from '../mocks/graphql/server/native-mock-server';

/**
 * Dual-mode fixtures (ADR-0016 §backend seam) — ONE spec, selectable backend.
 *
 * Specs under `src/tests/shared/` import this `test` and are written purely
 * against page objects + the {@link TestData} seam. Which backend they run
 * against is a *project* decision, not a spec decision:
 *
 *   • `playwright.config.ts` (hermetic) — `backend` defaults to `'mock'`:
 *     the page is the pre-authenticated hermetic context, api-isolation is
 *     installed, and TestData preconditions become `route.fulfill()` mocks.
 *   • `playwright.integration.config.ts` → `shared-live` project — sets
 *     `use: { backend: 'live' }`: the page authenticates against the live web
 *     app as the premium commissioner (same identity path as
 *     `integration/fixtures/ui.ts`), no interception, and TestData
 *     preconditions resolve against real backend state.
 *
 * Identity remains a fixture dimension (ADR-0015 §3): mock mode inherits the
 * global-setup storageState; live mode reuses the integration commissioner
 * JWT. Page objects are identical in both modes (ADR-0015 §6).
 */

export type BackendMode = 'mock' | 'live';

export interface BackendOptions {
  /**
   * Which backend this spec runs against. Set per project via
   * `use: { backend: 'live' }`; defaults to hermetic mock mode.
   */
  backend: BackendMode;
}

/**
 * The platform seam (ADR-0016 native rollout blueprint, step 3 — LS-8449),
 * orthogonal to {@link BackendMode}. It selects which {@link AppDriver}
 * migrated page objects are constructed with, so ONE shared spec body runs on
 * web or native without change (ADR-0016 §platform seam).
 */
export type PlatformMode = 'web' | 'native';

/**
 * Set (only) by `playwright.native.config.ts` before any worker spawns
 * (LS-9864). Read here, at module load, to choose the native
 * implementation of `driver`/`testData` below — one that never names the
 * `page` fixture in its signature — instead of branching on the `platform`
 * *fixture* inside a function that also destructures `page`. Playwright
 * resolves every fixture named in a function's destructured parameters
 * before the body runs, so a runtime branch doesn't prevent the browser
 * launch; only never naming `page` in the registered function does.
 */
const IS_NATIVE_WORKER = process.env.E2E_DUAL_PLATFORM === 'native';

export interface PlatformOptions {
  /**
   * Which platform driver this spec runs against. Set per project via
   * `use: { platform: 'native' }` (see `playwright.native.config.ts`);
   * defaults to web so the hermetic and integration configs are unchanged.
   */
  platform: PlatformMode;
}

export interface DualFixtures {
  /** Backend-appropriate data-precondition seam. */
  testData: TestData;
  /** Platform driver for migrated (ADR-0016) page objects. */
  driver: AppDriver;
  draftPage: DraftPage;
  leaguePage: LeaguePage;
  playersPage: PlayersPage;
  rosterPage: RosterPage;
  navHeader: NavHeader;
  _backendEnv: void;
}

/** Worker-scoped fixtures (one per Playwright worker process). */
export interface DualWorkerFixtures {
  /**
   * The per-worker hermetic-native GraphQL mock server (ADR-0017 — LS-8448).
   * Created once per worker but only *started* when a native + mock spec asks
   * for `testData`; a no-op resource for web/live workers. The emulator reaches
   * it via `adb reverse` (see `native-mock.ts`).
   */
  nativeMockServer: GraphQLMockServer;
}

export const test = base.extend<
  BackendOptions & PlatformOptions & DualFixtures,
  DualWorkerFixtures
>({
  backend: ['mock', { option: true }],
  platform: ['web', { option: true }],

  /**
   * One mock server per worker. Constructed unconditionally (cheap — no socket
   * until `.start()`), started lazily by the native-mock `testData` branch, and
   * torn down here. Web/live workers never start it, so it stays inert there.
   */
  nativeMockServer: [
    async ({}, use: (server: GraphQLMockServer) => Promise<void>) => {
      const server = createNativeMockServer();
      try {
        await use(server);
      } finally {
        await server.stop();
        if (isNativeEmulatorConfigured()) {
          await clearReverseForward();
        }
      }
    },
    { scope: 'worker' },
  ],

  /**
   * Live mode authenticates the default context against the live web app;
   * mock mode keeps the config-provided hermetic storageState untouched.
   */
  storageState: async ({ backend, storageState }, use) => {
    if (backend === 'live') {
      await use(buildIntegrationStorageState(await getAuthJwt()));
    } else {
      await use(storageState);
    }
  },

  /**
   * Live mode navigates the real web app (the integration config's `baseURL`
   * points at the GraphQL API, which is correct for API specs but not for
   * `page.goto('/players/stats')`); mock mode keeps the static-serve URL.
   */
  baseURL: async ({ backend, baseURL }, use) => {
    await use(backend === 'live' ? WEB_BASE : baseURL);
  },

  /**
   * Per-test NATIVE backend environment (`auto`, so it runs for every test):
   * starts the per-worker mock server, points the emulator at it via `adb
   * reverse` (when an emulator harness is configured), and `reset()`s it so
   * per-test overrides never leak between specs — the native analogue of
   * web's fresh-page-per-test isolation. Runs here (not in `testData`) so the
   * reset happens even for a native spec that declares no preconditions.
   *
   * Deliberately does NOT destructure `page` (LS-9864): Playwright resolves
   * every fixture named in a function's destructured parameters before the
   * body runs, regardless of which branch executes. An `auto: true` fixture
   * that named `page` here would force a browser launch on every
   * native-project test, even though this branch never touches `page` — and
   * `e2e-native-android.yml` never installs Playwright browsers, so that
   * launch fails outright. The web-only counterpart (API isolation +
   * coverage) lives in the `page` fixture override below instead, which is
   * only resolved when something actually requests `page`.
   */
  _backendEnv: [
    async (
      {
        backend,
        platform,
        nativeMockServer,
      }: {
        backend: BackendMode;
        platform: PlatformMode;
        nativeMockServer: GraphQLMockServer;
      },
      use: () => Promise<void>,
    ) => {
      if (platform === 'native' && backend === 'mock') {
        await nativeMockServer.start();
        if (isNativeEmulatorConfigured()) {
          await reverseForwardToDevice(nativeMockServer.port);
        }
        nativeMockServer.reset();
      }
      await use();
    },
    { auto: true },
  ],

  /**
   * Web-only `page` override: installs hermetic API isolation (mock backend)
   * and collects per-test source coverage (mirrors auth-enhanced, LS-7849).
   * Both are web/CDP concerns, so native tests pass `page` through untouched.
   *
   * This lives on `page` itself — rather than on a separate `auto: true`
   * fixture that destructures `page` — precisely so that native-project
   * tests, which never request `page` via this graph, never trigger it
   * (LS-9864).
   */
  page: async (
    {
      backend,
      platform,
      page,
    }: { backend: BackendMode; platform: PlatformMode; page: Page },
    use: (page: Page) => Promise<void>,
    testInfo: TestInfo,
  ) => {
    if (platform === 'native') {
      await use(page);
      return;
    }
    if (backend === 'mock') {
      await withApiIsolation(page, testInfo, async () => {
        const baseline = await snapshotCoverageBaseline(page);
        await use(page);
        await attributePageCoverage(page, testInfo, baseline);
      });
      return;
    }
    const baseline = await snapshotCoverageBaseline(page);
    await use(page);
    await attributePageCoverage(page, testInfo, baseline);
  },

  /**
   * Backend-appropriate data-precondition seam (ADR-0016 §backend seam).
   *
   * Split at module load (LS-9864) rather than branched on `platform` inside
   * one function: the native implementation never names `page` in its
   * signature, so a native-project test never forces Playwright to launch a
   * browser to get it — unlike a runtime `if (platform === 'native')` branch,
   * which doesn't prevent the eager resolution of a fixture that's still
   * destructured in the same function.
   */
  testData: IS_NATIVE_WORKER
    ? async (
        {
          backend,
          nativeMockServer,
        }: { backend: BackendMode; nativeMockServer: GraphQLMockServer },
        use: (testData: TestData) => Promise<void>,
      ) => {
        // Native + live: same identity path as the web `shared-live` project.
        if (backend !== 'mock') {
          await use(new LiveTestData());
          return;
        }
        // Native + mock: the per-worker server is started, wired via adb
        // reverse, and reset for this test by the `_backendEnv` auto-fixture
        // above; hand the spec a TestData seam that registers overrides
        // in-process on it.
        await use(new NativeMockTestData(nativeMockServer));
      }
    : async (
        { backend, page }: { backend: BackendMode; page: Page },
        use: (testData: TestData) => Promise<void>,
      ) => {
        await use(
          backend === 'mock' ? new MockTestData(page) : new LiveTestData(),
        );
      },

  /**
   * Platform driver — a *project* decision (ADR-0016), not a spec decision.
   * Web mode adapts the Playwright `page`; native mode injects the native
   * driver. Page objects are identical in both modes — they speak only the
   * AppDriver contract.
   *
   * Split at module load (LS-9864) for the same reason as `testData` above:
   * the native implementation never names `page`.
   */
  driver: IS_NATIVE_WORKER
    ? async ({}, use: (driver: AppDriver) => Promise<void>) => {
        // Drive a real Appium/UiAutomator2 session when an emulator harness
        // is configured (`E2E_NATIVE_APP` set — the scheduled, watched login →
        // league-list job of LS-8450). The `webdriverio` runtime is pulled in
        // via a dynamic import ONLY on this path, so the hermetic web PR-CI
        // collection of these shared specs never loads wdio (ADR-0016; see
        // appium-session.ts).
        if (!isNativeEmulatorConfigured()) {
          // No emulator harness in this environment — inject the
          // capability-only placeholder so capability-gated specs skip
          // cleanly. An ungated native interaction throws loudly rather than
          // silently passing.
          await use(createNativeDriver());
          return;
        }
        const { createAndroidSession } =
          await import('../driver/appium-session');
        const { driver, dispose } = await createAndroidSession();
        try {
          await use(driver);
        } finally {
          await dispose();
        }
      }
    : async (
        { page }: { page: Page },
        use: (driver: AppDriver) => Promise<void>,
      ) => {
        await use(new PlaywrightWebDriver(page));
      },

  // Page objects — identical instances in both modes (ADR-0015 §5, §6).
  draftPage: async (
    { driver }: { driver: AppDriver },
    use: (pageObject: DraftPage) => Promise<void>,
  ) => {
    await use(new DraftPage(driver));
  },
  leaguePage: async (
    { driver }: { driver: AppDriver },
    use: (pageObject: LeaguePage) => Promise<void>,
  ) => {
    await use(new LeaguePage(driver));
  },
  playersPage: async (
    { driver }: { driver: AppDriver },
    use: (pageObject: PlayersPage) => Promise<void>,
  ) => {
    await use(new PlayersPage(driver));
  },
  rosterPage: async (
    { driver }: { driver: AppDriver },
    use: (pageObject: RosterPage) => Promise<void>,
  ) => {
    await use(new RosterPage(driver));
  },
  navHeader: async (
    { page }: { page: Page },
    use: (component: NavHeader) => Promise<void>,
  ) => {
    await use(new NavHeader(page.getByRole('banner')));
  },
});

export { expect };
