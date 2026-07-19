/**
 * Driver contract — WEB (`PlaywrightWebDriver`).
 *
 * Runs the shared {@link ./app-driver-contract} cases against the real
 * Playwright driver on the script-free `data:`-URL fixture. Fully hermetic: no
 * web build, no dev server, no auth, no backend — it exercises only the
 * driver's element-resolution and assertion mechanics, so it runs in the
 * dedicated `contract` project (see `playwright.contract.config.ts`) rather
 * than the heavyweight hermetic app config.
 *
 * This is the runnable, hermetic half of AC1 ("a shared contract suite runs
 * against both drivers and passes") — green today via `nx run web-e2e:contract`
 * (wiring it into a CI pipeline rides with the native projects, LS-8449/LS-8450);
 * the native half runs the identical cases on an emulator
 * ({@link ./driver.native.spec}).
 */
import { test } from '@playwright/test';

import {
  APP_DRIVER_CONTRACT_CASES,
  assertCapabilities,
} from './app-driver-contract';
import { FIXTURE_DATA_URL } from './fixture';
import { PlaywrightWebDriver } from '../playwright-web.driver';
import type { AppDriver } from '../types';

const WEB_CAPABILITIES = {
  networkMock: true,
  clock: true,
  trace: true,
  hover: true,
  multiWindow: true,
} as const;

test.describe('AppDriver contract — PlaywrightWebDriver (web)', () => {
  let driver: AppDriver;

  test.beforeEach(async ({ page }) => {
    driver = new PlaywrightWebDriver(page);
    // Exercises AppDriver.open() itself: the fixture is a route the driver
    // navigates to, just like a real app route (a data: URL on web, a deep
    // link on native).
    await driver.open(FIXTURE_DATA_URL);
  });

  test('declares web capabilities honestly', () => {
    assertCapabilities(driver, WEB_CAPABILITIES);
  });

  for (const contractCase of APP_DRIVER_CONTRACT_CASES) {
    test(contractCase.name, async () => {
      await contractCase.run(driver);
    });
  }
});
