import { expect, test } from '../fixtures/auth-enhanced';

test.describe('Baseball Landing Page - Responsive @visual', () => {
  test('loads /baseball and renders key content', async ({ page }) => {
    await page.goto('/baseball');
    await page.waitForLoadState('load');

    // Verify the page renders without errors
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );

    // The baseball landing page should have meaningful content
    await expect(page.getByRole('main')).toBeVisible();
  });

  test('renders correctly at mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/baseball');
    await page.waitForLoadState('load');

    // Page should still render at mobile sizes
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.locator('body')).not.toContainText(
      'Unexpected Application Error',
    );
  });
});
