/**
 * Regression tests for /faq — LS-3518
 *
 * Bug: Direct navigation to /faq returned HTTP 404 and rendered the public
 * landing page (Build Your Dynasty headline) instead of FAQ content.
 *
 * Fix: /faq is now a client-side redirect to /pricing, which contains the
 * full FAQ accordion.  /faq is also added to publicPaths so unauthenticated
 * users reach it without being intercepted by the auth guard.
 */

import { expect, test, unauthTest } from '../fixtures/auth-enhanced';

// LS-3518: /faq must not 404 and must show FAQ content
test.describe('/faq page — no 404, shows FAQ content @regression', () => {
  test('navigating to /faq redirects to /pricing without a 404', async ({
    page,
  }) => {
    // Collect any 4xx responses while navigating to /faq.
    const failedResponses: number[] = [];
    page.on('response', (res) => {
      if (res.url().includes('/faq') && res.status() >= 400) {
        failedResponses.push(res.status());
      }
    });

    await page.goto('/faq');
    await page.waitForURL(/\/pricing/, { timeout: 10_000 });

    expect(failedResponses).toHaveLength(0);
    await expect(page).toHaveURL(/\/pricing/);
  });

  test('FAQ question-and-answer content is visible after navigating to /faq', async ({
    page,
  }) => {
    await page.goto('/faq');
    await page.waitForURL(/\/pricing/, { timeout: 10_000 });

    // The pricing page FAQ accordion must be present — this was absent in the
    // original bug where the landing page rendered instead.
    await expect(page.getByText(/frequently asked|faq/i).first()).toBeVisible({
      timeout: 10_000,
    });

    // At least one FAQ question from FAQ_ITEMS must be visible.
    await expect(
      page.getByText(/can i try premium before committing/i),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('landing-page headline is NOT shown when navigating to /faq', async ({
    page,
  }) => {
    await page.goto('/faq');
    await page.waitForURL(/\/pricing/, { timeout: 10_000 });

    // "Build Your Dynasty" is the landing-page hero copy that appeared in the
    // original 404 repro — it must not appear after the redirect resolves.
    await expect(page.getByText(/build your dynasty/i)).not.toBeVisible({
      timeout: 5_000,
    });
  });
});

// LS-3518: unauthenticated users must also be able to reach /faq
// (/faq is in publicPaths so the auth guard does not intercept it)
unauthTest.describe(
  '/faq — unauthenticated access must not 404 @regression',
  () => {
    unauthTest(
      'unauthenticated user navigating to /faq reaches pricing FAQ content',
      async ({ page }) => {
        await page.goto('/faq');
        await page.waitForURL(/\/pricing/, { timeout: 10_000 });

        await expect(page).toHaveURL(/\/pricing/);
        await expect(
          page.getByText(/frequently asked|faq/i).first(),
        ).toBeVisible({ timeout: 15_000 });
      },
    );

    unauthTest(
      'unauthenticated user at /faq does not see the 404 landing fallback',
      async ({ page }) => {
        await page.goto('/faq');
        await page.waitForURL(/\/pricing/, { timeout: 10_000 });

        // The landing page headline must not appear — that was the symptom of
        // the original bug (auth guard intercepted /faq before the redirect fired).
        await expect(page.getByText(/build your dynasty/i)).not.toBeVisible({
          timeout: 5_000,
        });
      },
    );
  },
);
