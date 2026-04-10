/**
 * Shared WebSocket test utilities for E2E tests.
 *
 * Extracted from websocket-realtime-updates.spec.ts and
 * websocket-auth-errors.spec.ts to avoid duplication.
 */

// ── WebSocket URL injection ──────────────────────────────────────────────────

/**
 * The deterministic test WebSocket URL injected into the app during E2E tests.
 * Playwright's `routeWebSocket(/wss?:\/\//)` intercepts any connection attempt
 * before it reaches the network, so the actual URL is irrelevant.
 */
export const E2E_WS_URL = 'wss://e2e-test.local/ws';

/**
 * Injects a fake WebSocket URL via `window.__e2eWsUrl` so the app attempts a
 * WebSocket connection in CI (where `VITE_WEBSOCKET_URL=""` at build time).
 *
 * `apps/web/src/config/environment.ts` already reads `window.__e2eWsUrl` when
 * `navigator.webdriver === true` (i.e. under Playwright), so setting the global
 * before any scripts run is the officially supported E2E override path.
 * No bundle patching needed.
 */
export async function injectWebSocketUrl(
  page: import('@playwright/test').Page,
): Promise<void> {
  // addInitScript runs before any page scripts, ensuring the global is set
  // before the app's environment.ts module is evaluated.
  await page.addInitScript((wsUrl: string) => {
    (window as unknown as Record<string, unknown>).__e2eWsUrl = wsUrl;
  }, E2E_WS_URL);
}

// ── GraphQL route helper ─────────────────────────────────────────────────────

/**
 * Returns true for GraphQL API URLs, excluding Vite virtual module URLs and
 * static asset requests that happen to contain "/graphql" in the path.
 */
export function isGraphQL(url: URL): boolean {
  const s = url.toString();
  return (
    s.includes('/graphql') &&
    !s.includes('/@fs/') &&
    !s.includes('.ts') &&
    !s.includes('.js')
  );
}
