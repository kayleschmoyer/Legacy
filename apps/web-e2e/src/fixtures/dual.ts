import {
  test as base,
  expect,
  type Page,
  type TestInfo,
} from '@playwright/test';

import { withApiIsolation } from './api-isolation';
import { attributePageCoverage, snapshotCoverageBaseline } from './coverage';
import { LiveTestData, MockTestData, type TestData } from './test-data';
import {
  buildIntegrationStorageState,
  getAuthJwt,
  WEB_BASE,
} from '../integration/fixtures/ui';
import { DraftPage, LeaguePage, PlayersPage } from '../pages';
import { NavHeader } from '../components';
import { type AppDriver, PlaywrightWebDriver } from '../driver';

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

export interface DualFixtures {
  /** Backend-appropriate data-precondition seam. */
  testData: TestData;
  /** Platform driver for migrated (ADR-0016) page objects. */
  driver: AppDriver;
  draftPage: DraftPage;
  leaguePage: LeaguePage;
  playersPage: PlayersPage;
  navHeader: NavHeader;
  _backendEnv: void;
  _coverage: void;
}

export const test = base.extend<BackendOptions & DualFixtures>({
  backend: ['mock', { option: true }],

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

  /** Hermetic API isolation — mock mode only (live specs must hit the API). */
  _backendEnv: [
    async (
      { backend, page }: { backend: BackendMode; page: Page },
      use: () => Promise<void>,
      testInfo: TestInfo,
    ) => {
      if (backend === 'mock') {
        await withApiIsolation(page, testInfo, use);
      } else {
        await use();
      }
    },
    { auto: true },
  ],

  /** Per-test source-coverage collection — mirrors auth-enhanced (LS-7849). */
  _coverage: [
    async (
      { page }: { page: Page },
      use: () => Promise<void>,
      testInfo: TestInfo,
    ) => {
      const baseline = await snapshotCoverageBaseline(page);
      await use();
      await attributePageCoverage(page, testInfo, baseline);
    },
    { auto: true },
  ],

  testData: async (
    { backend, page }: { backend: BackendMode; page: Page },
    use: (testData: TestData) => Promise<void>,
  ) => {
    await use(backend === 'mock' ? new MockTestData(page) : new LiveTestData());
  },

  driver: async (
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
  navHeader: async (
    { page }: { page: Page },
    use: (component: NavHeader) => Promise<void>,
  ) => {
    await use(new NavHeader(page.getByRole('banner')));
  },
});

export { expect };
