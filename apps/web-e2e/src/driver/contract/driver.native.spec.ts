/**
 * Driver contract — NATIVE (`AppiumNativeDriver`), emulator-gated.
 *
 * Runs the SAME shared {@link ./app-driver-contract} cases the web spec runs,
 * but against a WebdriverIO + Appium + UiAutomator2 session — the other half of
 * AC1 ("a shared contract suite runs against both drivers and passes"). It is
 * gated on {@link ../appium-env.isNativeEmulatorConfigured}: with no emulator/
 * Appium/APK it is SKIPPED (a missing device is an environment scoping
 * decision, not a failure), exactly as a capability gate skips a spec on a
 * driver that lacks a capability.
 *
 * Preconditions to run it (locally or in the LS-8450 scheduled job):
 *   - `E2E_NATIVE_APP` → absolute path to a built debug APK, and a running
 *     emulator + Appium server (see `../appium-env` for the full env surface).
 *   - The app renders the {@link ./fixture} contract screen at the deep-link
 *     route `E2E_NATIVE_CONTRACT_ROUTE` (default `/dev/driver-contract`) with
 *     the same `testID`s — the native counterpart of the web `data:`-URL
 *     fixture. Wiring that fixture screen + the hermetic backend is LS-8448 /
 *     LS-8449; this spec is the driver-side scaffold they light up.
 *
 * The wdio runtime is imported dynamically inside `beforeEach` so Playwright's
 * test collection (which imports every file under the config's testDir) does
 * not pull WebdriverIO into the hermetic web contract run.
 */
import { test } from '@playwright/test';

import {
  APP_DRIVER_CONTRACT_CASES,
  assertCapabilities,
} from './app-driver-contract';
import type { AppDriver } from '../types';
import { isNativeEmulatorConfigured, NATIVE_ENV } from '../appium-env';

const NATIVE_CAPABILITIES = {
  networkMock: false,
  clock: false,
  trace: false,
  hover: false,
  multiWindow: false,
} as const;

test.describe('AppDriver contract — AppiumNativeDriver (android)', () => {
  let driver: AppDriver;
  let dispose: (() => Promise<void>) | undefined;

  test.beforeEach(async () => {
    test.skip(
      !isNativeEmulatorConfigured(),
      'requires a native emulator (set E2E_NATIVE_APP + a running Appium server)',
    );
    const { createAndroidSession } = await import('../appium-session');
    const session = await createAndroidSession();
    driver = session.driver;
    dispose = session.dispose;
    await driver.open(
      process.env[NATIVE_ENV.contractRoute] ?? '/dev/driver-contract',
    );
  });

  test.afterEach(async () => {
    await dispose?.();
    dispose = undefined;
  });

  test('declares native capabilities honestly', () => {
    assertCapabilities(driver, NATIVE_CAPABILITIES);
  });

  for (const contractCase of APP_DRIVER_CONTRACT_CASES) {
    test(contractCase.name, async () => {
      await contractCase.run(driver);
    });
  }
});
