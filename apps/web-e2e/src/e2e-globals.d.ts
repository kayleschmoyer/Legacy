/**
 * E2E test globals injected by Playwright via page.addInitScript.
 *
 * Mirrors apps/web/src/types/e2e-globals.d.ts so both the web app and the
 * E2E test project share a common type for the runtime WebSocket URL override.
 * See apps/web-e2e/src/tests/websocket-realtime-updates.spec.ts for usage.
 */
interface Window {
  /** WebSocket URL override for E2E tests — never set in production. */
  __e2eWsUrl?: string;
  /** Jira proxy URL override for E2E tests — never set in production. */
  __e2eJiraProxyUrl?: string;
  /** Giphy API key override for E2E tests — never set in production. */
  __e2eGiphyApiKey?: string;
}
