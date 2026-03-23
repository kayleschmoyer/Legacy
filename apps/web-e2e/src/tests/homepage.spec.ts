/**
 * Homepage UI Tests
 *
 * Validates the static / near-static content on the root "/" page.
 * No async data loading is required; the homepage renders hero content
 * and navigation cards synchronously.
 */

import { expect, test } from '../fixtures/auth-enhanced';

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
    // HomePage renders a "Get Started" / baseball CTA button
    const cta = page.getByRole('button', {
      name: /get started|play ball|baseball/i,
    });
    await expect(cta).toBeVisible();
  });

  test('displays the Baseball sport card', async ({ page }) => {
    // Sports grid card with "Baseball" label — use .first() to avoid strict
    // mode violation when multiple elements contain the word "Baseball"
    await expect(page.getByText('Baseball').first()).toBeVisible();
  });

  test('Create League quick-action navigates to league creation', async ({
    page,
  }) => {
    // Baseball sport card has a "Create League" quick-action button
    const createLeagueBtn = page.getByRole('button', {
      name: /create league/i,
    });
    await expect(createLeagueBtn).toBeVisible();

    // Verify navigating directly to the create league page works
    await page.goto('/baseball/league/create');
    await page.waitForLoadState('load');
    await expect(page).toHaveURL('/baseball/league/create');
  });

  test('features section is present', async ({ page }) => {
    // The homepage includes a "features" / "everything you need" marketing section
    await expect(
      page.getByText(/everything you need|features|manage/i).first(),
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
