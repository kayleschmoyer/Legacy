/**
 * Loading State Accessibility E2E Suite (LS-2227)
 *
 * Covers:
 *  - aria-busy="true" on containers during loading states
 *  - Loading spinners have appropriate role and aria-label
 *  - aria-live regions announce when loading completes
 *  - Skeleton states are accessible (not announced as content to screen readers)
 *  - Page content is accessible after loading completes
 */

import { expect, test } from '../fixtures/auth-enhanced';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isGraphQLEndpoint(url: URL): boolean {
  const s = url.toString();
  return (
    s.includes('/graphql') &&
    !s.includes('/@fs/') &&
    !s.includes('.ts') &&
    !s.includes('.js')
  );
}

// ---------------------------------------------------------------------------
// 1. aria-busy During Loading
// ---------------------------------------------------------------------------

test.describe('Loading state accessibility @regression', () => {
  test('loading containers use aria-busy="true" during data fetch', async ({
    page,
  }) => {
    // Delay only the specific GraphQL operation needed to keep the loading UI
    // visible. Using isGraphQLEndpoint avoids intercepting non-API requests.
    await page.route(isGraphQLEndpoint, async (route) => {
      const postData = route.request().postData()?.toLowerCase() ?? '';
      if (
        postData.includes('getleaguebyid') ||
        postData.includes('getleague')
      ) {
        await new Promise<void>((r) => setTimeout(r, 800));
      }
      await route.fallback();
    });

    await page.goto('/baseball/league/1/overview');

    // Wait for aria-busy="true" to appear during loading (fails if never appears)
    await expect(page.locator('[aria-busy="true"]').first()).toBeAttached({
      timeout: 3000,
    });
    const count = await page.locator('[aria-busy="true"]').count();
    expect(count).toBeGreaterThan(0);

    // Regardless of aria-busy usage, the page should not crash during loading
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );

    await page.waitForLoadState('networkidle');
  });

  test('aria-busy resolves to false or is removed after loading completes', async ({
    page,
  }) => {
    await page.route(isGraphQLEndpoint, async (route) => {
      await new Promise<void>((r) => setTimeout(r, 400));
      await route.fallback();
    });

    await page.goto('/baseball/league/1/overview');
    await page.waitForLoadState('networkidle');

    // After loading completes, no element should still be aria-busy="true".
    // Use auto-retrying assertion to handle cascading GraphQL queries that
    // may briefly re-enter loading state after the first responses arrive.
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, {
      timeout: 10_000,
    });
  });
});

// ---------------------------------------------------------------------------
// 2. Loading Spinners
// ---------------------------------------------------------------------------

test.describe('Loading spinner accessibility @regression', () => {
  test('loading spinners have accessible labels during data fetch', async ({
    page,
  }) => {
    // Delay GraphQL to keep loading state visible longer
    await page.route(isGraphQLEndpoint, async (route) => {
      await new Promise<void>((r) => setTimeout(r, 1000));
      await route.fallback();
    });

    const navigationPromise = page.goto('/baseball/league/1/overview');

    // Keep visual spinners (explicitly labeled) separate from generic status
    // regions so status text does not mask an unlabeled spinner element.
    const labeledSpinners = page.locator(
      '[aria-label*="loading" i], [aria-labelledby]',
    );
    const statusRegions = page.locator('[role="status"]');

    // Wait briefly for the new page's loading UI to render, but allow pages
    // that complete loading without rendering a spinner/status element.
    const spinnerRenderDeadline = Date.now() + 1500;
    let spinnerCount = await labeledSpinners.or(statusRegions).count();
    while (spinnerCount === 0 && Date.now() < spinnerRenderDeadline) {
      await page.waitForTimeout(100);
      spinnerCount = await labeledSpinners.or(statusRegions).count();
    }

    const labeledSpinnerCount = await labeledSpinners.count();
    const statusRegionCount = await statusRegions.count();

    if (labeledSpinnerCount > 0) {
      const firstLabeledSpinner = labeledSpinners.first();
      await expect(firstLabeledSpinner).toBeAttached();

      // Labeled spinner should expose an accessible name directly.
      const ariaLabel = await firstLabeledSpinner.getAttribute('aria-label');
      const ariaLabelledBy =
        await firstLabeledSpinner.getAttribute('aria-labelledby');

      const hasAriaLabel = ariaLabel !== null && ariaLabel.trim().length > 0;
      const hasAriaLabelledBy =
        ariaLabelledBy !== null && ariaLabelledBy.trim().length > 0;
      expect(hasAriaLabel || hasAriaLabelledBy).toBe(true);
    }

    if (statusRegionCount > 0) {
      const firstStatusRegion = statusRegions.first();
      await expect(firstStatusRegion).toBeAttached();

      // Status regions should announce meaningful loading text (role alone is
      // insufficient — a status element with no text fails screen-reader usability).
      const textContent = await firstStatusRegion.textContent();
      expect(textContent !== null && textContent.trim().length > 0).toBe(true);
    }

    await navigationPromise;
    await page.waitForLoadState('networkidle');

    // Page should not crash during or after loading
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });

  test('no loading spinners remain after page load completes', async ({
    page,
  }) => {
    await page.goto('/baseball/league/1/overview');
    await page.waitForLoadState('networkidle');

    // networkidle fires before React.lazy() code-splitting finishes, so the
    // app-level Suspense fallback may still be visible. Wait for real page
    // content inside the main landmark to confirm the lazy route has rendered.
    await page
      .getByRole('main')
      .getByRole('heading')
      .first()
      .waitFor({ state: 'visible', timeout: 15000 });

    // After load, no spinner with role="status" should be visible
    const visibleSpinners = page.locator('[role="status"]:visible');
    const count = await visibleSpinners.count();

    // After load, no visible status element should still present a loading state.
    // Check both aria-label and text content since loaders may use either.
    for (let i = 0; i < count; i++) {
      const spinner = visibleSpinners.nth(i);
      const label = (await spinner.getAttribute('aria-label')) ?? '';
      const textContent = ((await spinner.textContent()) ?? '').trim();

      expect(label.toLowerCase()).not.toContain('loading');
      expect(textContent.toLowerCase()).not.toContain('loading');
    }
  });
});

// ---------------------------------------------------------------------------
// 3. aria-live Regions and Loading Announcements
// ---------------------------------------------------------------------------

test.describe('aria-live regions for loading announcements @regression', () => {
  test('polite aria-live region exists for loading announcements', async ({
    page,
  }) => {
    await page.goto('/about');
    await page.waitForLoadState('load');

    // The app must have a polite live region for non-urgent announcements
    // (e.g., "data loaded", route changes)
    const politeRegion = page.locator('[aria-live="polite"]');
    await expect(politeRegion.first()).toBeAttached();
  });

  test('aria-live region is present on data-driven pages', async ({ page }) => {
    await page.goto('/baseball/league/1/overview');
    await page.waitForLoadState('networkidle');

    // Data-driven pages should expose the global polite announcer used for app
    // updates (aria-live="polite" + aria-atomic="true"). A generic [aria-live]
    // count check is too broad — many unrelated elements carry aria-live.
    const politeRegion = page
      .locator('[aria-live="polite"][aria-atomic="true"]')
      .first();
    await expect(politeRegion).toBeAttached({ timeout: 5000 });
  });
});

// ---------------------------------------------------------------------------
// 4. Skeleton State Accessibility
// ---------------------------------------------------------------------------

test.describe('Skeleton state accessibility @regression', () => {
  test('skeleton screens do not expose raw placeholder text to screen readers', async ({
    page,
  }) => {
    await page.route(isGraphQLEndpoint, async (route) => {
      await new Promise<void>((r) => setTimeout(r, 500));
      await route.fallback();
    });

    await page.goto('/baseball/league/1/overview');

    // Skeleton elements should be aria-hidden (presentational) so screen
    // readers do not announce placeholder content
    const skeletons = page.locator(
      '[data-testid*="skeleton"], .skeleton, [class*="skeleton"]',
    );

    // Poll briefly during the loading delay window so we don't miss transient
    // skeleton elements. If the page uses a spinner pattern instead of skeletons
    // the assertions below are intentionally skipped — skeletons are not required.
    const skeletonDeadline = Date.now() + 600;
    let skeletonCount = await skeletons.count();
    while (skeletonCount === 0 && Date.now() < skeletonDeadline) {
      await page.waitForTimeout(100);
      skeletonCount = await skeletons.count();
    }

    if (skeletonCount > 0) {
      for (let i = 0; i < Math.min(skeletonCount, 5); i++) {
        const skeleton = skeletons.nth(i);
        const ariaHidden = await skeleton.getAttribute('aria-hidden');
        const role = await skeleton.getAttribute('role');
        const ariaLabel = await skeleton.getAttribute('aria-label');

        // Skeleton must either be aria-hidden OR have an explicit accessible label
        // that describes it as a loading placeholder (not content)
        const isHidden = ariaHidden === 'true';
        const hasLoadingLabel =
          ariaLabel !== null && /loading|placeholder/i.test(ariaLabel);
        const isPresentational = role === 'none' || role === 'presentation';

        expect(isHidden || hasLoadingLabel || isPresentational).toBe(true);
      }
    }

    // Page should not crash during loading
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );

    await page.waitForLoadState('networkidle');
  });

  test('page does not crash while displaying skeleton loading state', async ({
    page,
  }) => {
    await page.route(isGraphQLEndpoint, async (route) => {
      await new Promise<void>((r) => setTimeout(r, 600));
      await route.fallback();
    });

    await page.goto('/baseball/league/1/overview');

    // Verify no error boundary was triggered during skeleton phase
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );

    await page.waitForLoadState('networkidle');

    // Verify page is still intact after loading completes
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });
});

// ---------------------------------------------------------------------------
// 5. Post-Load Accessibility
// ---------------------------------------------------------------------------

test.describe('Page accessibility after loading completes @smoke', () => {
  test('main content is accessible after loading completes on data-driven page', async ({
    page,
  }) => {
    await page.goto('/baseball/league/1/overview');
    await page.waitForLoadState('networkidle');

    // Main content landmark should be present and visible after load.
    // Use .first() because the league detail page nests its own role="main"
    // inside the app shell's role="main", producing two landmarks.
    await expect(page.getByRole('main').first()).toBeVisible({
      timeout: 15000,
    });

    // No error state
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });

  test('main content is accessible after loading completes on static page', async ({
    page,
  }) => {
    await page.goto('/about');
    await page.waitForLoadState('load');

    // Main content landmark should be present and visible
    await expect(page.getByRole('main').first()).toBeVisible({
      timeout: 15000,
    });

    // No error state
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });

  test('interactive elements are accessible after loading completes', async ({
    page,
  }) => {
    await page.goto('/baseball/league/1/overview');
    await page.waitForLoadState('networkidle');

    // The page should have focusable interactive elements after load
    // (links, buttons, etc.)
    const interactiveElements = page.locator(
      'a[href], button:not([disabled]), [role="button"]',
    );
    const count = await interactiveElements.count();
    expect(count).toBeGreaterThan(0);
  });

  test('ARIA landmarks are present after loading completes', async ({
    page,
  }) => {
    await page.goto('/baseball/league/1/overview');
    await page.waitForLoadState('networkidle');

    // Critical landmarks should remain after data loads.
    // Use .first() for main — league detail pages nest a second role="main".
    await expect(page.getByRole('banner')).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('main').first()).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible(
      { timeout: 15000 },
    );
  });
});
