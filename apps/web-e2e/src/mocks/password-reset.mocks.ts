import type { Page, Route } from '@playwright/test';

/**
 * Hermetic route handlers for the password-reset flow (LS-8461).
 *
 * The forgot/reset pages POST to `${oauthProxyUrl}/…`; in the E2E build
 * `oauthProxyUrl` is restored to `http://localhost:5001` via the
 * `window.__e2eOauthProxyUrl` override (see `fixtures/api-isolation.ts` and
 * `apps/web/src/config/environment.ts`). The api-isolation layer blocks that
 * origin with a 401 catch-all, so a spec must install these handlers to shape
 * the response. Playwright matches routes LIFO, so these (registered in the
 * test body) take precedence over the fixture's catch-all.
 *
 * Mocking lives here — a route handler — not in the page objects (ADR-0015 §6).
 */

/** Origin the web app posts password-reset requests to in the E2E build. */
export const OAUTH_PROXY_ORIGIN = 'http://localhost:5001';

const FORGOT_PASSWORD_URL = `${OAUTH_PROXY_ORIGIN}/forgot-password`;
const RESET_PASSWORD_URL = `${OAUTH_PROXY_ORIGIN}/reset-password`;

async function fulfillJson(
  route: Route,
  status: number,
  body: Record<string, unknown>,
): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

/** `POST /forgot-password` → 200 (email accepted). */
export async function mockForgotPasswordSuccess(page: Page): Promise<void> {
  await page.route(FORGOT_PASSWORD_URL, (route) =>
    fulfillJson(route, 200, { ok: true }),
  );
}

/**
 * `POST /forgot-password` → server error, driving the generic
 * "Something went wrong. Please try again." state.
 */
export async function mockForgotPasswordError(
  page: Page,
  status = 500,
): Promise<void> {
  await page.route(FORGOT_PASSWORD_URL, (route) =>
    fulfillJson(route, status, { error: 'Internal error' }),
  );
}

/** `POST /reset-password` → 200 (password updated). */
export async function mockResetPasswordSuccess(page: Page): Promise<void> {
  await page.route(RESET_PASSWORD_URL, (route) =>
    fulfillJson(route, 200, { ok: true }),
  );
}

/**
 * `POST /reset-password` → rejection whose `error` field the page surfaces
 * verbatim (e.g. an expired or already-used token).
 */
export async function mockResetPasswordError(
  page: Page,
  opts: { error: string; status?: number },
): Promise<void> {
  await page.route(RESET_PASSWORD_URL, (route) =>
    fulfillJson(route, opts.status ?? 400, { error: opts.error }),
  );
}
