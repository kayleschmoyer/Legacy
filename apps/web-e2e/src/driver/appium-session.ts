import { remote } from 'webdriverio';

import { AppiumNativeDriver, NATIVE_APP_PACKAGE } from './appium-native.driver';
import {
  type AndroidSessionConfig,
  androidSessionConfigFromEnv,
} from './appium-env';

/**
 * WebdriverIO session factory for the native ({@link ./appium-native.driver})
 * driver (ADR-0016 native rollout blueprint step 1).
 *
 * Keeping session creation OUT of the driver class is deliberate: the driver
 * stays a pure adapter over an injected `Browser` (exactly as
 * {@link ./playwright-web.driver.PlaywrightWebDriver} adapts an injected
 * `Page`), and every device/build concern — capabilities, the app under test,
 * animation disabling — lives here. No platform branch ever reaches a page
 * object (ADR-0016 §4).
 *
 * ## Emulator gating
 *
 * A wdio+Appium session requires a running emulator, an Appium server, and a
 * built app APK — none of which exist in a plain unit/CI-lint environment.
 * Specs that construct a native driver therefore gate on
 * {@link isNativeEmulatorConfigured} and skip when the harness is absent
 * (`test.skip(!isNativeEmulatorConfigured(), …)`), exactly as a capability gate
 * skips a spec on a driver that lacks a capability. Emulator provisioning in CI
 * (the scheduled, watched login → league-list job) is LS-8450; the per-worker
 * GraphQL mock server that makes hermetic native runs possible is LS-8448.
 *
 * The WebdriverIO-free environment probe (`isNativeEmulatorConfigured`,
 * `androidSessionConfigFromEnv`, `NATIVE_ENV`) lives in {@link ./appium-env} so
 * specs can decide whether to skip without importing the wdio runtime.
 */

/**
 * Create a UiAutomator2 session and wrap it in an {@link AppiumNativeDriver}.
 * Returns the driver plus a `dispose()` that ends the session — call it in a
 * spec's teardown.
 *
 * `appium:disableWindowAnimation: true` is the canonical native-flake fix
 * (ADR-0016): mid-animation taps race the UiAutomator2 event dispatch, so the
 * test build must run with window/transition/animator scale at zero.
 */
export async function createAndroidSession(
  config: AndroidSessionConfig = androidSessionConfigFromEnv(),
): Promise<{ driver: AppiumNativeDriver; dispose: () => Promise<void> }> {
  const browser = await remote({
    hostname: config.host ?? '127.0.0.1',
    port: config.port ?? 4723,
    logLevel: 'warn',
    capabilities: {
      platformName: 'Android',
      'appium:automationName': 'UiAutomator2',
      'appium:deviceName': config.deviceName ?? 'Android Emulator',
      'appium:platformVersion': config.platformVersion ?? '13',
      'appium:app': config.app,
      'appium:appPackage': config.appPackage ?? NATIVE_APP_PACKAGE,
      'appium:autoGrantPermissions': true,
      'appium:newCommandTimeout': 240,
      // Canonical native-flake fix — zero out window/transition/animator scale
      // so taps never race an in-flight animation (ADR-0016).
      'appium:disableWindowAnimation': true,
    },
  });

  const driver = new AppiumNativeDriver(browser, {
    appPackage: config.appPackage ?? NATIVE_APP_PACKAGE,
  });

  return {
    driver,
    dispose: async () => {
      await browser.deleteSession();
    },
  };
}
