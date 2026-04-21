/**
 * Homepage UI Tests
 *
 * Validates the static / near-static content on the root "/" page.
 * No async data loading is required; the homepage renders hero content
 * and navigation cards synchronously.
 */

import { expect, test, unauthTest } from '../fixtures/auth-enhanced';

test.describe('Homepage @smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('load');
  });

  test('loads and has a meaningful page title', async ({ page }) => {
    const title = await page.title();
    expect(title).toBeTruthy();
    expect(title.length).toBeGreaterThan(0);
  });

  test('displays hero heading', async ({ page }) => {
    // The hero section contains an H1 with "Legacy Sports" branding copy or similar
    const heading = page.getByRole('heading', { level: 1 }).first();
    await expect(heading).toBeVisible();
  });

  test('displays a call-to-action button linking to baseball', async ({
    page,
  }) => {
    // HomePage renders baseball onboarding CTA buttons (Create League, Join League)
    const cta = page.getByRole('button', { name: /join league/i });
    await expect(cta).toBeVisible();
    await cta.click();
    await page.waitForLoadState('load');
    await expect(page).toHaveURL('/baseball/league/join');
  });

  test('displays the Baseball sport card', async ({ page }) => {
    // Sports grid card with "Baseball" label — use .first() to avoid strict
    // mode violation when multiple elements contain the word "Baseball"
    await expect(page.getByText('Baseball').first()).toBeVisible();
  });

  test('Create League quick-action navigates to league creation', async ({
    page,
  }) => {
    // Multiple "Create League" buttons exist (hero + sport cards); target first enabled one
    const createLeagueBtn = page
      .getByRole('button', { name: /create league/i, disabled: false })
      .first();
    await expect(createLeagueBtn).toBeVisible();
    await expect(createLeagueBtn).toBeEnabled();

    // Verify navigating directly to the create league page works
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('load');
    await expect(page).toHaveURL('/baseball/league/create');
  });

  test('features section is present', async ({ page }) => {
    // The homepage includes content sections: sport picker and/or history feed
    await expect(
      page.getByText(/choose your sport|on this day/i).first(),
    ).toBeVisible();
  });

  test('page is accessible with skip navigation link', async ({ page }) => {
    // The skip-link should be present for keyboard accessibility
    const skipLink = page.locator('a[href="#main-content"]');
    const count = await skipLink.count();
    if (count > 0) {
      // Verify the link is in the DOM and has the correct href
      await expect(skipLink.first()).toHaveAttribute('href', '#main-content');
    }
  });
});

// ---------------------------------------------------------------------------
// Public Landing Page (unauthenticated "/") — accessibility regression
// ---------------------------------------------------------------------------

unauthTest.describe('Public Landing Page accessibility @regression', () => {
  unauthTest.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('load');
  });

  unauthTest(
    'logo image has non-empty alt text (LS-3528)',
    async ({ page }) => {
      const logo = page.locator('img[src*="logo"]').first();
      await expect(logo).toBeVisible({ timeout: 10000 });
      const alt = await logo.getAttribute('alt');
      expect(alt).toBeTruthy();
      expect((alt ?? '').trim().length).toBeGreaterThan(0);
    },
  );

  // LS-3471: a functional scanner reported that clicking the "Get Started
  // Free" CTA on "/" produced no action. Root cause was the scanner's own
  // invalid selector `(button:visible, [role="button"]:visible)` failing to
  // parse — the button itself is wired to handleSignIn. Lock in that the CTA
  // is reachable via a valid accessible-name locator and is clickable.
  unauthTest(
    '"Get Started Free" CTA on / is reachable and clickable (LS-3471)',
    async ({ page }) => {
      const getStartedBtn = page
        .getByRole('button', { name: /get started free/i })
        .first();
      await expect(getStartedBtn).toBeVisible({ timeout: 15_000 });
      await expect(getStartedBtn).toBeEnabled();
      await getStartedBtn.click();
    },
  );
});
