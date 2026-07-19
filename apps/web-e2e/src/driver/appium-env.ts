/**
 * WebdriverIO-free environment probe for the native driver harness (ADR-0016).
 *
 * Kept separate from {@link ./appium-session} (which imports the `webdriverio`
 * runtime) so specs can decide whether to skip WITHOUT loading wdio at
 * Playwright collection time — Playwright imports every file under a config's
 * `testDir` to collect tests, so a top-level `webdriverio` import in a native
 * spec would drag the whole wdio runtime into the hermetic web contract run.
 */

/** Connection + device configuration for a native session. */
export interface AndroidSessionConfig {
  /** Absolute path to the built debug APK under test. */
  readonly app?: string;
  /** Android package to (re)launch; defaults to the app package. */
  readonly appPackage?: string;
  /** Appium server host (default: `127.0.0.1`). */
  readonly host?: string;
  /** Appium server port (default: `4723`). */
  readonly port?: number;
  /** Emulator/device name (default: `Android Emulator`). */
  readonly deviceName?: string;
  /** Target Android platform version (default: `13`). */
  readonly platformVersion?: string;
}

/**
 * Environment variables that configure a local native run. Mirrors the wdio
 * config in `apps/app-e2e` so a developer can point either at the same
 * emulator. Presence of {@link AppEnv.app} (the APK path) is the signal that a
 * native harness is available.
 */
export const NATIVE_ENV = {
  /** Absolute path to the built debug APK — the presence signal. */
  app: 'E2E_NATIVE_APP',
  appPackage: 'E2E_NATIVE_APP_PACKAGE',
  host: 'APPIUM_HOST',
  port: 'APPIUM_PORT',
  deviceName: 'ANDROID_DEVICE_NAME',
  platformVersion: 'ANDROID_PLATFORM_VERSION',
  /** Deep-link route the native driver contract renders its fixture at. */
  contractRoute: 'E2E_NATIVE_CONTRACT_ROUTE',
  /** League id (in draft state) for the reference-migration native run. */
  draftLeagueId: 'E2E_NATIVE_DRAFT_LEAGUE_ID',
} as const;

/**
 * True when a native emulator harness is configured (an APK path is exported).
 * Native specs gate on this and skip otherwise — a missing emulator is an
 * environment scoping decision, never a hard failure in lint/unit CI. Emulator
 * provisioning in CI is LS-8450.
 */
export function isNativeEmulatorConfigured(): boolean {
  return Boolean(process.env[NATIVE_ENV.app]);
}

/** Read {@link AndroidSessionConfig} from the environment (see {@link NATIVE_ENV}). */
export function androidSessionConfigFromEnv(): AndroidSessionConfig {
  const port = process.env[NATIVE_ENV.port];
  return {
    app: process.env[NATIVE_ENV.app],
    appPackage: process.env[NATIVE_ENV.appPackage],
    host: process.env[NATIVE_ENV.host],
    port: port ? Number(port) : undefined,
    deviceName: process.env[NATIVE_ENV.deviceName],
    platformVersion: process.env[NATIVE_ENV.platformVersion],
  };
}
