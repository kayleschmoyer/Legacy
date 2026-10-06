/**
 * Regression tests for unknown routes — LS-10704 (absorbed LS-10749)
 *
 * Bug: any URL that matched no route rendered the header and score ticker
 * around a completely empty <main> — no Not Found message, no way home.
 * The legacy sport-less league URL (/league/:id) was blank the same way.
 *
 * Fix: a catch-all route renders a "Page not found" page with a link home,
 * and redirects /league/:id to /baseball/league/:id.
 */

import { expect, test } from '../fixtures/auth-enhanced';

test.describe('Unknown routes show a Not Found page @regression', () => {
  for (const path of ['/qa_nonexistent', '/baseball/qa_nonexistent']) {
    test(`${path} renders Page not found with a working link home`, async ({
      page,
    }) => {
      await page.goto(path);

      const main = page.getByTestId('main-content');
      await expect(main.getByText('Page not found')).toBeVisible({
        timeout: 10_000,
      });
      await expect(page).toHaveTitle(/Page not found/);

      const homeLink = main.getByRole('link', { name: 'Go to home' });
      await expect(homeLink).toHaveAttribute('href', '/');
      await homeLink.click();
      await expect(page).toHaveURL(/\/$/);
      await expect(main.getByText('Page not found')).not.toBeVisible();
    });
  }

  test('legacy /league/:id redirects to the baseball league page', async ({
    page,
  }) => {
    await page.goto('/league/14109');
    await page.waitForURL(/\/baseball\/league\/14109$/, { timeout: 10_000 });
    await expect(
      page.getByTestId('main-content').getByText('Page not found'),
    ).not.toBeVisible();
  });
});
