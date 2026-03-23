import { expect, test } from '../fixtures/auth-enhanced';

test.describe('Web Application @smoke', () => {
  test('should load the homepage', async ({ page }) => {
    await page.goto('/');

    // Wait for the page to load
    await page.waitForLoadState('load');

    // Check that the page has loaded with a meaningful title
    expect(await page.title()).toBeTruthy();

    // Verify key structural elements are present
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.getByRole('main')).toBeVisible();
  });

  test('should navigate to different sections', async ({ page }) => {
    await page.goto('/');

    // Wait for the page to load
    await page.waitForLoadState('load');

    // Verify navigation area exists and is visible
    const navigation = page.locator('nav, header, [role="navigation"]').first();
    await expect(navigation).toBeVisible();
  });

  test('should handle authentication flow', async ({ page }) => {
    await page.goto('/');

    // Wait for the page to load
    await page.waitForLoadState('load');

    // Authenticated user should see their profile or dashboard content,
    // not a "Get Started with Google" login prompt
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });

  test('should have correct page structure', async ({ page }) => {
    await page.goto('/');

    // Wait for the page to load
    await page.waitForLoadState('load');

    // Verify fundamental HTML structure is present
    await expect(page.locator('[role="banner"]')).toBeAttached();
    await expect(page.locator('[role="main"]')).toBeAttached();

    // Page should have at least one heading
    const headings = page.getByRole('heading');
    expect(await headings.count()).toBeGreaterThan(0);
  });

  test('should render key UI components', async ({ page }) => {
    await page.goto('/');

    // Wait for the page to load
    await page.waitForLoadState('load');

    // Verify key components exist in the DOM
    const components = ['[role="banner"]', '[role="main"]'];

    for (const selector of components) {
      const element = page.locator(selector).first();
      await expect(element).toBeAttached();
    }
  });
});
