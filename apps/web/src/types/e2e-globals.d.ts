/**
 * E2E test globals injected by Playwright via page.addInitScript.
 *
 * These are ONLY present when running under an automated browser
 * (navigator.webdriver === true).  The app checks this flag before
 * reading any override so production builds are unaffected even if
 * a page somehow has these globals set.
 *
 * See apps/web/src/config/environment.ts for usage.
 */
interface Window {
  /** WebSocket URL override for E2E tests — never set in production. */
  __e2eWsUrl?: string;
}
