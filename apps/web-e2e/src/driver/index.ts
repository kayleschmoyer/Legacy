export type {
  AppDriver,
  DriverCapabilities,
  ElementScope,
  ExpectOptions,
  TextOptions,
  UIElement,
  UIRole,
} from './types';
export { PlaywrightWebDriver } from './playwright-web.driver';
// The `platform: 'native'` fixture seam (LS-8449) resolves a native driver via
// `createNativeDriver()`. It currently returns the throwing placeholder below;
// wiring it to the real `AppiumNativeDriver` needs an async wdio session
// (emulator lifecycle — LS-8450) and stays with that work.
export { createNativeDriver } from './pending-native.driver';
// The real native driver (LS-8447): a pure adapter over an injected wdio
// `Browser` (it imports `webdriverio` for TYPES only), so re-exporting it here
// pulls no WebdriverIO runtime into the hermetic web path. Session creation
// lives in `./appium-session` (which DOES import `remote` at runtime) and is
// imported directly by the emulator-gated native specs, never through this barrel.
export {
  AppiumNativeDriver,
  buildDeepLink,
  NATIVE_APP_PACKAGE,
  NATIVE_APP_SCHEME,
} from './appium-native.driver';
export type { AppiumNativeDriverOptions } from './appium-native.driver';
// The native route-parity seam (ADR-0016 amendment — LS-9653): pure and
// dependency-free, so it is safe to import from the hermetic web path too
// (e.g. a spec asserting the mapping directly) without pulling in wdio.
export {
  resolveNativeRoute,
  UnmappedNativeRouteError,
} from './native-route-map';
