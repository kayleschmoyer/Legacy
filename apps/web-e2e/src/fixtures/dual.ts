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
  _coverage: void;
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
   * Per-test backend environment (`auto`, so it runs for every test).
   *
   *   • Web mock: install hermetic `page.route()` API isolation.
   *   • Native mock: start the per-worker mock server, point the emulator at it
   *     via `adb reverse` (when an emulator harness is configured), and `reset()`
   *     it so per-test overrides never leak between specs — the native analogue
   *     of web's fresh-page-per-test isolation. Runs here (not in `testData`) so
   *     the reset happens even for a native spec that declares no preconditions.
   *   • Live (either platform): no isolation — specs hit the real API.
   */
  _backendEnv: [
    async (
      {
        backend,
        platform,
        page,
        nativeMockServer,
      }: {
        backend: BackendMode;
        platform: PlatformMode;
        page: Page;
        nativeMockServer: GraphQLMockServer;
      },
      use: () => Promise<void>,
      testInfo: TestInfo,
    ) => {
      if (platform === 'native') {
        if (backend === 'mock') {
          await nativeMockServer.start();
          if (isNativeEmulatorConfigured()) {
            await reverseForwardToDevice(nativeMockServer.port);
          }
          nativeMockServer.reset();
        }
        await use();
        return;
      }
      if (backend === 'mock') {
        await withApiIsolation(page, testInfo, use);
      } else {
        await use();
      }
    },
    { auto: true },
  ],

  /**
   * Per-test source-coverage collection — mirrors auth-enhanced (LS-7849).
   * V8 coverage is a Playwright/CDP web-only concern, so native runs skip it
   * (the native driver has no `page` to instrument).
   */
  _coverage: [
    async (
      { page, platform }: { page: Page; platform: PlatformMode },
      use: () => Promise<void>,
      testInfo: TestInfo,
    ) => {
      if (platform === 'native') {
        await use();
        return;
      }
      const baseline = await snapshotCoverageBaseline(page);
      await use();
      await attributePageCoverage(page, testInfo, baseline);
    },
    { auto: true },
  ],

  testData: async (
    {
      backend,
      platform,
      page,
      nativeMockServer,
    }: {
      backend: BackendMode;
      platform: PlatformMode;
      page: Page;
      nativeMockServer: GraphQLMockServer;
    },
    use: (testData: TestData) => Promise<void>,
  ) => {
    if (platform === 'native') {
      // Native + live: same identity path as the web `shared-live` project.
      if (backend !== 'mock') {
        await use(new LiveTestData());
        return;
      }
      // Native + mock: the per-worker server is started, wired via adb reverse,
      // and reset for this test by the `_backendEnv` auto-fixture above; hand the
      // spec a TestData seam that registers overrides in-process on it.
      await use(new NativeMockTestData(nativeMockServer));
      return;
    }
    await use(backend === 'mock' ? new MockTestData(page) : new LiveTestData());
  },

  /**
   * Platform driver — a *project* decision (ADR-0016), not a spec decision.
   * Web mode adapts the Playwright `page`; native mode injects the native
   * driver (`playwright.native.config.ts` projects set `platform: 'native'`).
   * Page objects are identical in both modes — they speak only the AppDriver
   * contract.
   */
  driver: async (
    { page, platform }: { page: Page; platform: PlatformMode },
    use: (driver: AppDriver) => Promise<void>,
  ) => {
    if (platform !== 'native') {
      await use(new PlaywrightWebDriver(page));
      return;
    }
    // Native: drive a real Appium/UiAutomator2 session when an emulator harness
    // is configured (`E2E_NATIVE_APP` set — the scheduled, watched login →
    // league-list job of LS-8450). The `webdriverio` runtime is pulled in via a
    // dynamic import ONLY on this path, so the hermetic web PR-CI collection of
    // these shared specs never loads wdio (ADR-0016; see appium-session.ts).
    if (!isNativeEmulatorConfigured()) {
      // No emulator harness in this environment — inject the capability-only
      // placeholder so capability-gated specs skip cleanly. An ungated native
      // interaction throws loudly rather than silently passing.
      await use(createNativeDriver());
      return;
    }
    const { createAndroidSession } = await import('../driver/appium-session');
    const { driver, dispose } = await createAndroidSession();
    try {
      await use(driver);
    } finally {
      await dispose();
    }
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
