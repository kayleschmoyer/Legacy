/**
 * E2E Tests: Global Error Handling (LS-613)
 *
 * Covers:
 *  - ApolloErrorToast: renders when apollo:error event is dispatched
 *  - Toast: shows error message, dismiss button, accessible role="alert"
 *  - GraphQL error display: individual pages show error states when query fails
 *
 * The Apollo ErrorLink fires a CustomEvent('apollo:error', { detail: { message }})
 * on window whenever a request fails.  Tests drive this directly to keep them
 * fast and deterministic without requiring specific timing on the network layer.
 */

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// ── Helpers ────────────────────────────────────────────────────────────────
function isGraphQLEndpoint(url: URL): boolean {
  const s = url.toString();
  return (
    s.includes('/graphql') &&
    !s.includes('/@fs/') &&
    !s.includes('.ts') &&
    !s.includes('.js')
  );
}

async function dispatchApolloError(page: Page, message: string) {
  await page.evaluate((msg) => {
    window.dispatchEvent(
      new CustomEvent('apollo:error', { detail: { message: msg } }),
    );
  }, message);
}

// ── ApolloErrorToast ───────────────────────────────────────────────────────

test.describe('ApolloErrorToast @critical', () => {
  test.beforeEach(async ({ page }) => {
    // /about renders without GraphQL — stable base page
    await page.goto('/about');
    await page.waitForLoadState('load');
  });

  test('appears when apollo:error event is dispatched @smoke', async ({
    page,
  }) => {
    await dispatchApolloError(page, 'Something went wrong. Please try again.');
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 5000 });
  });

  test('displays the error message content @critical', async ({ page }) => {
    const msg = 'Failed to load player data.';
    await dispatchApolloError(page, msg);
    await expect(page.getByRole('alert')).toContainText(msg, { timeout: 5000 });
  });

  test('has accessible live region role=alert @critical', async ({ page }) => {
    await dispatchApolloError(page, 'Network error occurred.');
    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible({ timeout: 5000 });
    await expect(alert).toHaveAttribute('aria-live', 'assertive');
  });

  test('has a dismiss button @critical', async ({ page }) => {
    await dispatchApolloError(page, 'Request failed. Try again later.');
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 5000 });
    const dismissBtn = page.getByRole('button', { name: /dismiss error/i });
    await expect(dismissBtn).toBeVisible();
  });

  test('dismisses toast when dismiss button is clicked @critical', async ({
    page,
  }) => {
    await dispatchApolloError(page, 'Dismiss test error.');
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 5000 });

    await page.getByRole('button', { name: /dismiss error/i }).click();
    await expect(page.getByRole('alert')).not.toBeVisible({ timeout: 5000 });
  });

  test('can be triggered multiple times with updated message @regression', async ({
    page,
  }) => {
    await dispatchApolloError(page, 'First error message.');
    await expect(page.getByRole('alert')).toContainText(
      'First error message.',
      {
        timeout: 5000,
      },
    );

    await page.getByRole('button', { name: /dismiss error/i }).click();

    await dispatchApolloError(page, 'Second error message.');
    await expect(page.getByRole('alert')).toContainText(
      'Second error message.',
      {
        timeout: 5000,
      },
    );
  });

  test('toast is not visible initially (no error dispatched) @smoke', async ({
    page,
  }) => {
    // Alert should not be present before any error is dispatched
    await expect(page.getByRole('alert')).not.toBeVisible();
  });
});

// ── GraphQL error state on individual pages ────────────────────────────────

test.describe('GraphQL error states on pages @regression', () => {
  test('player stats page shows error message when query fails @critical', async ({
    page,
  }) => {
    await page.route(
      (url) => isGraphQLEndpoint(url),
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            errors: [{ message: 'Internal server error' }],
            data: null,
          }),
        });
      },
    );

    await page.goto('/players/stats');
    // Page should display an error state (text or apollo toast)
    await expect(
      page
        .getByRole('alert')
        .or(page.getByText(/error|failed|unavailable/i).first()),
    ).toBeVisible({ timeout: 10000 });
  });

  test('league discovery page shows error when query fails @regression', async ({
    page,
  }) => {
    await page.route(
      (url) => isGraphQLEndpoint(url),
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            errors: [{ message: 'Database connection error' }],
            data: null,
          }),
        });
      },
    );

    await page.goto('/baseball/leagues');
    await expect(
      page
        .getByRole('alert')
        .or(page.getByText(/error|failed|something went wrong/i).first()),
    ).toBeVisible({ timeout: 10000 });
  });

  test('players directory shows error message when query fails @regression', async ({
    page,
  }) => {
    await page.route(
      (url) => isGraphQLEndpoint(url),
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            errors: [{ message: 'Query timeout' }],
            data: null,
          }),
        });
      },
    );

    await page.goto('/players');
    await expect(
      page
        .getByRole('alert')
        .or(page.getByText(/error|failed|unable to load/i).first()),
    ).toBeVisible({ timeout: 10000 });
  });
});

// ── Network-level errors ───────────────────────────────────────────────────

test.describe('Network error handling @regression', () => {
  test('toast appears when GraphQL endpoint returns 500 @regression', async ({
    page,
  }) => {
    await page.route(
      (url) => isGraphQLEndpoint(url),
      async (route) => {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Internal Server Error' }),
        });
      },
    );

    await page.goto('/players/stats');

    // May show either the apollo error toast or an inline error state
    await expect(
      page
        .getByRole('alert')
        .or(page.getByText(/error|failed|went wrong/i).first()),
    ).toBeVisible({ timeout: 10000 });
  });
});
